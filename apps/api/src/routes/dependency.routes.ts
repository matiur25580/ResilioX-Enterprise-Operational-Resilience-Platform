import { Router } from 'express';
import { z } from 'zod';
import { DependencyNodeType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { hasDirectedPath, traverseVerifiedGraph, type GraphEdge } from '../lib/dependency-graph.js';

export const dependencyRouter = Router();
dependencyRouter.use(requireAuth);

const nodeTypes = ['BUSINESS_SERVICE', 'BUSINESS_PROCESS', 'APPLICATION', 'TECHNOLOGY_ASSET', 'SUPPLIER'] as const;
const dependencyTypes = ['SUPPORTS', 'HOSTED_ON', 'DEPENDS_ON', 'PROVIDED_BY', 'OPERATES_FROM', 'PROCESSED_BY'] as const;
const criticalities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const statuses = ['PROPOSED', 'VERIFIED', 'DISPUTED', 'RETIRED'] as const;

const edgeSchema = z.object({
  sourceType: z.enum(nodeTypes),
  sourceId: z.string().uuid(),
  targetType: z.enum(nodeTypes),
  targetId: z.string().uuid(),
  type: z.enum(dependencyTypes),
  criticality: z.enum(criticalities).default('MEDIUM'),
  confidence: z.number().int().min(0).max(100).default(50),
});

async function findTenantNode(organizationId: string, type: DependencyNodeType, id: string) {
  switch (type) {
    case 'BUSINESS_SERVICE': return prisma.businessService.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    case 'BUSINESS_PROCESS': return prisma.businessProcess.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    case 'APPLICATION': return prisma.application.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    case 'TECHNOLOGY_ASSET': return prisma.technologyAsset.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    case 'SUPPLIER': return prisma.supplier.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
  }
}

async function loadTenantNodes(organizationId: string) {
  const [services, processes, applications, assets, suppliers] = await Promise.all([
    prisma.businessService.findMany({ where: { organizationId }, select: { id: true, name: true, criticality: true, status: true } }),
    prisma.businessProcess.findMany({ where: { organizationId }, select: { id: true, name: true, ownerName: true } }),
    prisma.application.findMany({ where: { organizationId }, select: { id: true, name: true, vendor: true } }),
    prisma.technologyAsset.findMany({ where: { organizationId }, select: { id: true, name: true, assetType: true, environment: true } }),
    prisma.supplier.findMany({ where: { organizationId }, select: { id: true, name: true, criticality: true } }),
  ]);
  return [
    ...services.map(node => ({ ...node, type: 'BUSINESS_SERVICE' as const })),
    ...processes.map(node => ({ ...node, type: 'BUSINESS_PROCESS' as const })),
    ...applications.map(node => ({ ...node, type: 'APPLICATION' as const })),
    ...assets.map(node => ({ ...node, type: 'TECHNOLOGY_ASSET' as const })),
    ...suppliers.map(node => ({ ...node, type: 'SUPPLIER' as const })),
  ];
}

dependencyRouter.get('/nodes', async (req, res) => {
  const nodes = await loadTenantNodes(req.auth!.organizationId);
  res.json({ data: nodes });
});

dependencyRouter.get('/graph', async (req, res) => {
  const query = z.object({ nodeType: z.enum(nodeTypes), nodeId: z.string().uuid() }).parse(req.query);
  const organizationId = req.auth!.organizationId;
  const rootNode = await findTenantNode(organizationId, query.nodeType, query.nodeId);
  if (!rootNode) throw new AppError(404, 'DEPENDENCY_NODE_NOT_FOUND', 'The selected node was not found in this workspace.');
  const records = await prisma.dependency.findMany({
    where: { organizationId, status: 'VERIFIED' },
    orderBy: [{ sourceType: 'asc' }, { sourceId: 'asc' }, { targetType: 'asc' }, { targetId: 'asc' }],
  });
  const graph = traverseVerifiedGraph(records as GraphEdge[], { type: query.nodeType, id: query.nodeId }, 200);
  const nodes = await loadTenantNodes(organizationId);
  const names = new Map(nodes.map(node => [node.type + ':' + node.id, node.name]));
  const edges = graph.edges.map(edge => ({ ...edge, sourceName: names.get(edge.sourceType + ':' + edge.sourceId) ?? 'Unknown node', targetName: names.get(edge.targetType + ':' + edge.targetId) ?? 'Unknown node' }));
  res.json({ data: { ...graph, edges, generatedAt: new Date().toISOString(), traversal: 'outgoing_verified_edges_only', maxNodes: 200 } });
});

dependencyRouter.get('/', async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const status = req.query.status ? z.enum(statuses).parse(req.query.status) : undefined;
  const records = await prisma.dependency.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    orderBy: [{ updatedAt: 'desc' }],
    take: 500,
  });
  const nodes = await loadTenantNodes(organizationId);
  const names = new Map(nodes.map(node => [node.type + ':' + node.id, node.name]));
  res.json({ data: records.map(edge => ({
    ...edge,
    sourceName: names.get(edge.sourceType + ':' + edge.sourceId) ?? 'Unknown node',
    targetName: names.get(edge.targetType + ':' + edge.targetId) ?? 'Unknown node',
  })) });
});

dependencyRouter.post('/', requirePermission('continuity:write'), async (req, res) => {
  const input = edgeSchema.parse(req.body);
  if (input.sourceType === input.targetType && input.sourceId === input.targetId) {
    throw new AppError(400, 'DEPENDENCY_SELF_REFERENCE', 'A node cannot depend on itself.');
  }
  const organizationId = req.auth!.organizationId;
  const [source, target] = await Promise.all([
    findTenantNode(organizationId, input.sourceType as DependencyNodeType, input.sourceId),
    findTenantNode(organizationId, input.targetType as DependencyNodeType, input.targetId),
  ]);
  if (!source || !target) throw new AppError(404, 'DEPENDENCY_NODE_NOT_FOUND', 'Both dependency endpoints must exist in the active workspace.');
  const existing = await prisma.dependency.findFirst({
    where: { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, targetType: input.targetType, targetId: input.targetId, type: input.type },
    select: { id: true },
  });
  if (existing) throw new AppError(409, 'DEPENDENCY_ALREADY_EXISTS', 'This typed dependency relationship already exists.');
  const activeEdges = await prisma.dependency.findMany({ where: { organizationId, status: { not: 'RETIRED' } } });
  if (hasDirectedPath(activeEdges as GraphEdge[], { type: input.targetType, id: input.targetId }, { type: input.sourceType, id: input.sourceId })) {
    throw new AppError(409, 'DEPENDENCY_CYCLE_DETECTED', 'This relationship would create a directed dependency cycle.');
  }
  try {
    const created = await prisma.$transaction(async tx => {
      const record = await tx.dependency.create({
        data: { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, targetType: input.targetType, targetId: input.targetId, type: input.type, criticality: input.criticality, confidence: input.confidence, status: 'PROPOSED' },
      });
      await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'dependency.created', targetType: 'dependency', targetId: record.id, metadata: { sourceType: input.sourceType, targetType: input.targetType, type: input.type } } });
      return record;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ data: created });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'DEPENDENCY_ALREADY_EXISTS', 'This typed dependency relationship already exists.');
    }
    throw error;
  }
});

dependencyRouter.patch('/:dependencyId/status', requirePermission('continuity:write'), async (req, res) => {
  const dependencyId = z.string().uuid().parse(req.params.dependencyId);
  const input = z.object({ status: z.enum(statuses) }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.dependency.findFirst({ where: { id: dependencyId, organizationId } });
  if (!current) throw new AppError(404, 'DEPENDENCY_NOT_FOUND', 'The dependency relationship was not found.');
  const allowed: Record<string, string[]> = {
    PROPOSED: ['VERIFIED', 'DISPUTED', 'RETIRED'],
    VERIFIED: ['DISPUTED', 'RETIRED'],
    DISPUTED: ['PROPOSED', 'VERIFIED', 'RETIRED'],
    RETIRED: [],
  };
  if (!allowed[current.status].includes(input.status)) throw new AppError(409, 'DEPENDENCY_INVALID_TRANSITION', 'This dependency status transition is not permitted.');
  const result = await prisma.$transaction(async tx => {
    const update = await tx.dependency.updateMany({
      where: { id: dependencyId, organizationId, status: current.status },
      data: { status: input.status, verifiedAt: input.status === 'VERIFIED' ? new Date() : null },
    });
    if (update.count !== 1) throw new AppError(409, 'DEPENDENCY_CONCURRENT_UPDATE', 'The dependency changed while this request was being processed. Refresh and retry.');
    const updated = await tx.dependency.findFirst({ where: { id: dependencyId, organizationId } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'dependency.status_changed', targetType: 'dependency', targetId: dependencyId, metadata: { from: current.status, to: input.status } } });
    return updated;
  });
  res.json({ data: result });
});
