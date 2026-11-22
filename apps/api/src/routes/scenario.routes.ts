import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { calculateScenarioImpact } from '../lib/scenario-simulation.js';
import type { GraphEdge } from '../lib/dependency-graph.js';

export const scenarioRouter = Router();
scenarioRouter.use(requireAuth);

const nodeTypes = ['BUSINESS_SERVICE', 'BUSINESS_PROCESS', 'APPLICATION', 'TECHNOLOGY_ASSET', 'SUPPLIER'] as const;
const templates = [
  { id: 'service-outage', name: 'Critical service outage', category: 'SERVICE', description: 'Trace downstream exposure from an unavailable business service.', defaultSeverity: 'UNAVAILABLE', recommendedDurationHours: 8 },
  { id: 'supplier-disruption', name: 'Critical supplier disruption', category: 'THIRD_PARTY', description: 'Explore service exposure when a supplier dependency is disrupted.', defaultSeverity: 'UNAVAILABLE', recommendedDurationHours: 24 },
  { id: 'application-degradation', name: 'Application degradation', category: 'TECHNOLOGY', description: 'Model a degraded application dependency and prioritize affected services.', defaultSeverity: 'DEGRADED', recommendedDurationHours: 4 },
  { id: 'technology-asset-loss', name: 'Technology asset loss', category: 'TECHNOLOGY', description: 'Assess downstream service exposure from a technology asset outage.', defaultSeverity: 'UNAVAILABLE', recommendedDurationHours: 12 },
] as const;

async function tenantNode(organizationId: string, type: typeof nodeTypes[number], id: string) {
  switch (type) {
    case 'BUSINESS_SERVICE': return prisma.businessService.findFirst({ where: { id, organizationId }, select: { id: true, name: true, criticality: true } });
    case 'BUSINESS_PROCESS': return prisma.businessProcess.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    case 'APPLICATION': return prisma.application.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    case 'TECHNOLOGY_ASSET': return prisma.technologyAsset.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    case 'SUPPLIER': return prisma.supplier.findFirst({ where: { id, organizationId }, select: { id: true, name: true, criticality: true } });
  }
}

scenarioRouter.get('/templates', (_req, res) => res.json({ data: templates }));

scenarioRouter.get('/runs', async (req, res) => {
  const events = await prisma.auditEvent.findMany({
    where: { organizationId: req.auth!.organizationId, action: 'scenario.simulation.created' },
    orderBy: { createdAt: 'desc' }, take: 50,
    select: { id: true, metadata: true, createdAt: true, actorUserId: true },
  });
  res.json({ data: events.map(event => ({
    id: event.id, createdAt: event.createdAt, actorUserId: event.actorUserId,
    ...(event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) ? event.metadata : {}),
  })) });
});

scenarioRouter.post('/runs', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({
    templateId: z.enum(['service-outage', 'supplier-disruption', 'application-degradation', 'technology-asset-loss']),
    rootType: z.enum(nodeTypes), rootId: z.string().uuid(),
    severity: z.enum(['DEGRADED', 'UNAVAILABLE']), durationHours: z.number().int().min(1).max(720),
    notes: z.string().trim().max(2000).optional(),
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const rootRecord = await tenantNode(organizationId, input.rootType, input.rootId);
  if (!rootRecord) throw new AppError(404, 'SCENARIO_NODE_NOT_FOUND', 'The selected scenario target was not found in this workspace.');
  const [services, processes, applications, assets, suppliers, edges, plans] = await Promise.all([
    prisma.businessService.findMany({ where: { organizationId }, select: { id: true, name: true, criticality: true } }),
    prisma.businessProcess.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.application.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.technologyAsset.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { organizationId }, select: { id: true, name: true, criticality: true } }),
    prisma.dependency.findMany({ where: { organizationId, status: 'VERIFIED' }, orderBy: [{ sourceType: 'asc' }, { sourceId: 'asc' }, { targetType: 'asc' }, { targetId: 'asc' }] }),
    prisma.continuityPlan.findMany({ where: { organizationId, status: 'APPROVED' }, orderBy: [{ serviceId: 'asc' }, { version: 'desc' }], select: { serviceId: true, rtoMinutes: true } }),
  ]);
  const nodes = [
    ...services.map(node => ({ ...node, type: 'BUSINESS_SERVICE' })),
    ...processes.map(node => ({ ...node, type: 'BUSINESS_PROCESS' })),
    ...applications.map(node => ({ ...node, type: 'APPLICATION' })),
    ...assets.map(node => ({ ...node, type: 'TECHNOLOGY_ASSET' })),
    ...suppliers.map(node => ({ ...node, type: 'SUPPLIER' })),
  ];
  const root = { ...rootRecord, type: input.rootType };
  const approvedRtoByService: Record<string, number> = {};
  for (const plan of plans) if (approvedRtoByService[plan.serviceId] === undefined) approvedRtoByService[plan.serviceId] = plan.rtoMinutes;
  const result = calculateScenarioImpact({
    root, nodes, edges: edges as GraphEdge[], durationHours: input.durationHours, severity: input.severity, approvedRtoByService,
  });
  const run = { templateId: input.templateId, notes: input.notes ?? null, result, actorUserId: req.auth!.userId };
  const event = await prisma.auditEvent.create({
    data: {
      organizationId, actorUserId: req.auth!.userId, action: 'scenario.simulation.created',
      targetType: input.rootType, targetId: input.rootId, metadata: run,
    },
    select: { id: true, createdAt: true },
  });
  res.status(201).json({ data: { id: event.id, createdAt: event.createdAt, ...run } });
});
