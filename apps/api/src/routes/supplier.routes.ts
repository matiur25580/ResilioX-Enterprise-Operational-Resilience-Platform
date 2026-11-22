import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const supplierRouter = Router();
supplierRouter.use(requireAuth);

const criticalities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const contractStatuses = ['DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'] as const;
const evidenceTypes = ['CERTIFICATION', 'AUDIT_REPORT', 'TEST_RESULT', 'POLICY', 'CONTRACT', 'OTHER'] as const;

supplierRouter.get('/summary', async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const [suppliers, dependencies, contracts, assessments] = await Promise.all([
    prisma.supplier.findMany({ where: { organizationId }, select: { id: true, name: true, criticality: true } }),
    prisma.dependency.findMany({ where: { organizationId, status: 'VERIFIED', OR: [{ sourceType: 'SUPPLIER' }, { targetType: 'SUPPLIER' }] }, select: { sourceType: true, sourceId: true, targetType: true, targetId: true, criticality: true } }),
    prisma.supplierContract.findMany({ where: { organizationId }, select: { supplierId: true, status: true, expiresAt: true, recoveryTimeHours: true, recoveryPointMinutes: true } }),
    prisma.supplierAssessment.findMany({ where: { organizationId, status: 'APPROVED' }, orderBy: [{ supplierId: 'asc' }, { version: 'desc' }], select: { supplierId: true, version: true, resilienceScore: true, securityScore: true, concentrationScore: true } }),
  ]);
  const latest = new Map<string, typeof assessments[number]>();
  for (const item of assessments) if (!latest.has(item.supplierId)) latest.set(item.supplierId, item);
  const exposure = suppliers.map(supplier => {
    const edges = dependencies.filter(edge => (edge.sourceType === 'SUPPLIER' && edge.sourceId === supplier.id) || (edge.targetType === 'SUPPLIER' && edge.targetId === supplier.id));
    const linkedServices = new Set(edges.flatMap(edge => [
      edge.sourceType === 'BUSINESS_SERVICE' ? edge.sourceId : null,
      edge.targetType === 'BUSINESS_SERVICE' ? edge.targetId : null,
    ]).filter(Boolean));
    const supplierContracts = contracts.filter(contract => contract.supplierId === supplier.id);
    return { ...supplier, verifiedDependencyCount: edges.length, linkedServiceCount: linkedServices.size, activeContractCount: supplierContracts.filter(contract => contract.status === 'ACTIVE').length, latestApprovedAssessment: latest.get(supplier.id) ?? null };
  }).sort((a, b) => b.linkedServiceCount - a.linkedServiceCount || b.verifiedDependencyCount - a.verifiedDependencyCount);
  res.json({ data: { supplierCount: suppliers.length, criticalSupplierCount: suppliers.filter(s => s.criticality === 'CRITICAL' || s.criticality === 'HIGH').length, verifiedSupplierDependencyCount: dependencies.length, expiringContracts: contracts.filter(c => c.expiresAt && c.expiresAt <= new Date(Date.now() + 90 * 86400000) && ['ACTIVE', 'EXPIRING'].includes(c.status)).length, suppliers: exposure } });
});

supplierRouter.get('/', async (req, res) => {
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: req.auth!.organizationId },
    include: { contracts: { orderBy: { expiresAt: 'asc' }, include: { services: true } }, assessments: { orderBy: { version: 'desc' }, include: { evidence: { orderBy: { createdAt: 'desc' } } } } },
    orderBy: [{ criticality: 'asc' }, { name: 'asc' }], take: 250,
  });
  res.json({ data: suppliers });
});

supplierRouter.post('/', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(2).max(180), website: z.string().url().max(255).optional(),
    contactEmail: z.string().email().max(254).optional(), criticality: z.enum(criticalities).default('MEDIUM'),
  }).parse(req.body);
  try {
    const created = await prisma.$transaction(async tx => {
      const supplier = await tx.supplier.create({ data: { ...input, organizationId: req.auth!.organizationId } });
      await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'supplier.created', targetType: 'supplier', targetId: supplier.id } });
      return supplier;
    });
    res.status(201).json({ data: created });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'SUPPLIER_ALREADY_EXISTS', 'A supplier with this name already exists in this workspace.');
    throw error;
  }
});

supplierRouter.post('/:supplierId/contracts', requirePermission('continuity:write'), async (req, res) => {
  const supplierId = z.string().uuid().parse(req.params.supplierId);
  const input = z.object({
    contractReference: z.string().trim().min(2).max(120), ownerName: z.string().trim().min(2).max(120),
    status: z.enum(contractStatuses).default('DRAFT'), effectiveAt: z.string().datetime().optional(), expiresAt: z.string().datetime().optional(),
    renewalNoticeDays: z.number().int().min(0).max(3650).optional(), recoveryTimeHours: z.number().int().min(0).optional(),
    recoveryPointMinutes: z.number().int().min(0).optional(), serviceCreditTerms: z.string().max(10000).optional(),
    exitAssistanceTerms: z.string().max(10000).optional(), dataReturnTerms: z.string().max(10000).optional(),
    serviceIds: z.array(z.string().uuid()).max(100).default([]),
  }).superRefine((value, ctx) => {
    if (value.effectiveAt && value.expiresAt && new Date(value.expiresAt) <= new Date(value.effectiveAt)) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Contract expiry must be after its effective date.' });
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId }, select: { id: true } });
  if (!supplier) throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'The supplier was not found in this workspace.');
  const services = await prisma.businessService.findMany({ where: { id: { in: input.serviceIds }, organizationId }, select: { id: true } });
  if (services.length !== new Set(input.serviceIds).size) throw new AppError(404, 'SUPPLIER_SERVICE_NOT_FOUND', 'One or more linked services were not found in this workspace.');
  const contract = await prisma.$transaction(async tx => {
    const created = await tx.supplierContract.create({ data: {
      organizationId, supplierId, contractReference: input.contractReference, ownerName: input.ownerName, status: input.status,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      renewalNoticeDays: input.renewalNoticeDays, recoveryTimeHours: input.recoveryTimeHours, recoveryPointMinutes: input.recoveryPointMinutes,
      serviceCreditTerms: input.serviceCreditTerms, exitAssistanceTerms: input.exitAssistanceTerms, dataReturnTerms: input.dataReturnTerms,
      services: { create: services.map(service => ({ organizationId, serviceId: service.id })) },
    }, include: { services: true } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'supplier.contract_created', targetType: 'supplier_contract', targetId: created.id, metadata: { serviceCount: services.length, status: created.status } } });
    return created;
  });
  res.status(201).json({ data: contract });
});

supplierRouter.post('/:supplierId/assessments', requirePermission('continuity:write'), async (req, res) => {
  const supplierId = z.string().uuid().parse(req.params.supplierId);
  const input = z.object({
    ownerName: z.string().trim().min(2).max(120), resilienceScore: z.number().int().min(1).max(5),
    securityScore: z.number().int().min(1).max(5), concentrationScore: z.number().int().min(1).max(5),
    rationale: z.string().trim().min(10).max(10000), nextReviewAt: z.string().datetime().optional(),
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId }, select: { id: true } });
  if (!supplier) throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'The supplier was not found in this workspace.');
  const latest = await prisma.supplierAssessment.findFirst({ where: { supplierId, organizationId }, orderBy: { version: 'desc' }, select: { version: true } });
  const assessment = await prisma.$transaction(async tx => {
    const created = await tx.supplierAssessment.create({ data: {
      organizationId, supplierId, version: (latest?.version ?? 0) + 1, ownerName: input.ownerName,
      resilienceScore: input.resilienceScore, securityScore: input.securityScore, concentrationScore: input.concentrationScore,
      rationale: input.rationale, nextReviewAt: input.nextReviewAt ? new Date(input.nextReviewAt) : null, createdByUserId: req.auth!.userId,
    } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'supplier.assessment_created', targetType: 'supplier_assessment', targetId: created.id, metadata: { version: created.version } } });
    return created;
  });
  res.status(201).json({ data: assessment });
});

supplierRouter.post('/assessments/:assessmentId/submit', requirePermission('continuity:write'), async (req, res) => {
  const assessmentId = z.string().uuid().parse(req.params.assessmentId);
  const changed = await prisma.$transaction(async tx => {
    const result = await tx.supplierAssessment.updateMany({ where: { id: assessmentId, organizationId: req.auth!.organizationId, status: 'DRAFT' }, data: { status: 'IN_REVIEW' } });
    if (result.count !== 1) throw new AppError(409, 'SUPPLIER_ASSESSMENT_NOT_SUBMITTABLE', 'Only a draft assessment can be submitted.');
    await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'supplier.assessment_submitted', targetType: 'supplier_assessment', targetId: assessmentId } });
    return tx.supplierAssessment.findFirstOrThrow({ where: { id: assessmentId, organizationId }, include: { evidence: true } });
  });
  res.json({ data: changed });
});

supplierRouter.post('/assessments/:assessmentId/approve', requirePermission('continuity:write'), async (req, res) => {
  const assessmentId = z.string().uuid().parse(req.params.assessmentId);
  const input = z.object({ rationale: z.string().trim().min(5).max(2000) }).parse(req.body);
  const changed = await prisma.$transaction(async tx => {
    const current = await tx.supplierAssessment.findFirst({ where: { id: assessmentId, organizationId: req.auth!.organizationId } });
    if (!current) throw new AppError(404, 'SUPPLIER_ASSESSMENT_NOT_FOUND', 'The supplier assessment was not found.');
    if (current.status !== 'IN_REVIEW' || current.createdByUserId === req.auth!.userId) throw new AppError(409, 'SUPPLIER_ASSESSMENT_MAKER_CHECKER', 'An assessment must be reviewed by a different user after submission.');
    const evidenceCount = await tx.supplierEvidence.count({ where: { organizationId: req.auth!.organizationId, assessmentId } });
    if (evidenceCount === 0) throw new AppError(409, 'SUPPLIER_ASSESSMENT_EVIDENCE_REQUIRED', 'At least one evidence reference is required before approval.');
    const result = await tx.supplierAssessment.updateMany({ where: { id: assessmentId, organizationId: req.auth!.organizationId, status: 'IN_REVIEW' }, data: { status: 'APPROVED', assessedAt: new Date(), approvedByUserId: req.auth!.userId } });
    if (result.count !== 1) throw new AppError(409, 'SUPPLIER_ASSESSMENT_CONFLICT', 'The assessment changed while approval was being recorded.');
    await tx.supplierAssessment.updateMany({ where: { organizationId: req.auth!.organizationId, supplierId: current.supplierId, id: { not: assessmentId }, status: 'APPROVED' }, data: { status: 'SUPERSEDED' } });
    await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'supplier.assessment_approved', targetType: 'supplier_assessment', targetId: assessmentId, metadata: { rationale: input.rationale } } });
    return tx.supplierAssessment.findFirstOrThrow({ where: { id: assessmentId, organizationId: req.auth!.organizationId }, include: { evidence: true } });
  });
  res.json({ data: changed });
});

supplierRouter.post('/assessments/:assessmentId/evidence', requirePermission('continuity:write'), async (req, res) => {
  const assessmentId = z.string().uuid().parse(req.params.assessmentId);
  const input = z.object({ title: z.string().trim().min(2).max(180), evidenceType: z.enum(['CERTIFICATION','AUDIT_REPORT','TEST_RESULT','POLICY','CONTRACT','OTHER']), reference: z.string().trim().min(3).max(1000), expiresAt: z.string().datetime().optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const assessment = await prisma.supplierAssessment.findFirst({ where: { id: assessmentId, organizationId, status: { in: ['DRAFT','IN_REVIEW'] } }, select: { id: true } });
  if (!assessment) throw new AppError(404, 'SUPPLIER_ASSESSMENT_NOT_EDITABLE', 'Evidence can only be added to a draft or in-review assessment in this workspace.');
  const evidence = await prisma.$transaction(async tx => {
    const created = await tx.supplierEvidence.create({ data: { ...input, organizationId, assessmentId, recordedBy: req.auth!.userId, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'supplier.evidence_recorded', targetType: 'supplier_evidence', targetId: created.id, metadata: { evidenceType: created.evidenceType } } });
    return created;
  });
  res.status(201).json({ data: evidence });
});
