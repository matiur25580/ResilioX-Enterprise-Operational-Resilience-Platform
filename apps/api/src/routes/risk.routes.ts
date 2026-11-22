import { Router } from 'express';
import { z } from 'zod';
import { RiskTargetType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { calculateInherentRisk, calculateResidualRisk } from '../lib/risk-scoring.js';

export const riskRouter = Router();
riskRouter.use(requireAuth);

const targetTypes = ['BUSINESS_SERVICE', 'BUSINESS_PROCESS', 'APPLICATION', 'TECHNOLOGY_ASSET', 'SUPPLIER', 'DEPENDENCY'] as const;
const riskStatuses = ['IDENTIFIED', 'ASSESSED', 'TREATING', 'ACCEPTED', 'CLOSED'] as const;
const controlStatuses = ['DESIGN', 'IMPLEMENTED', 'TESTED', 'NEEDS_REMEDIATION'] as const;
const treatmentStatuses = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const;

async function targetExists(organizationId: string, type: RiskTargetType, id: string) {
  switch (type) {
    case 'BUSINESS_SERVICE': return !!await prisma.businessService.findFirst({ where: { id, organizationId }, select: { id: true } });
    case 'BUSINESS_PROCESS': return !!await prisma.businessProcess.findFirst({ where: { id, organizationId }, select: { id: true } });
    case 'APPLICATION': return !!await prisma.application.findFirst({ where: { id, organizationId }, select: { id: true } });
    case 'TECHNOLOGY_ASSET': return !!await prisma.technologyAsset.findFirst({ where: { id, organizationId }, select: { id: true } });
    case 'SUPPLIER': return !!await prisma.supplier.findFirst({ where: { id, organizationId }, select: { id: true } });
    case 'DEPENDENCY': return !!await prisma.dependency.findFirst({ where: { id, organizationId }, select: { id: true } });
  }
}

function includeRisk() {
  return {
    controls: { include: { control: true }, orderBy: { createdAt: 'asc' as const } },
    treatments: { orderBy: { dueAt: 'asc' as const } },
  };
}

riskRouter.get('/summary', async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const risks = await prisma.risk.findMany({ where: { organizationId, status: { not: 'CLOSED' } }, select: { residualScore: true, inherentScore: true, status: true } });
  const controls = await prisma.control.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } });
  return res.json({ data: {
    totalRisks: risks.length,
    criticalRisks: risks.filter(r => r.residualScore >= 17).length,
    highRisks: risks.filter(r => r.residualScore >= 10 && r.residualScore < 17).length,
    averageResidualScore: risks.length ? Math.round(risks.reduce((sum, r) => sum + r.residualScore, 0) / risks.length * 10) / 10 : 0,
    controls: controls.reduce((acc, item) => ({ ...acc, [item.status]: item._count._all }), {} as Record<string, number>),
  } });
});

riskRouter.get('/', async (req, res) => {
  const risks = await prisma.risk.findMany({ where: { organizationId: req.auth!.organizationId }, include: includeRisk(), orderBy: [{ residualScore: 'desc' }, { updatedAt: 'desc' }], take: 250 });
  res.json({ data: risks });
});

riskRouter.post('/', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({
    title: z.string().trim().min(3).max(180), description: z.string().trim().min(10).max(10000),
    category: z.string().trim().min(2).max(80), ownerName: z.string().trim().min(2).max(120),
    likelihood: z.number().int().min(1).max(5), impact: z.number().int().min(1).max(5),
    targetType: z.enum(targetTypes).optional(), targetId: z.string().uuid().optional(),
    reviewDueAt: z.string().datetime().optional(),
  }).superRefine((v, ctx) => {
    if (!!v.targetType !== !!v.targetId) ctx.addIssue({ code: 'custom', path: ['targetId'], message: 'Target type and target ID must be provided together.' });
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  if (input.targetType && input.targetId && !await targetExists(organizationId, input.targetType as RiskTargetType, input.targetId)) {
    throw new AppError(404, 'RISK_TARGET_NOT_FOUND', 'The selected risk target does not exist in this workspace.');
  }
  const inherentScore = calculateInherentRisk(input.likelihood, input.impact);
  const risk = await prisma.$transaction(async tx => {
    const created = await tx.risk.create({ data: {
      organizationId, title: input.title, description: input.description, category: input.category, ownerName: input.ownerName,
      likelihood: input.likelihood, impact: input.impact, inherentScore, residualScore: inherentScore,
      targetType: input.targetType, targetId: input.targetId, reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : null,
    }, include: includeRisk() });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'risk.created', targetType: 'risk', targetId: created.id, metadata: { inherentScore, targetType: input.targetType ?? null } } });
    return created;
  });
  res.status(201).json({ data: risk });
});

riskRouter.get('/controls', async (req, res) => {
  const controls = await prisma.control.findMany({ where: { organizationId: req.auth!.organizationId }, orderBy: [{ status: 'asc' }, { name: 'asc' }], take: 250 });
  res.json({ data: controls });
});

riskRouter.post('/controls', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(3).max(180), description: z.string().trim().min(10).max(10000),
    controlType: z.string().trim().min(2).max(60), ownerName: z.string().trim().min(2).max(120),
    frequency: z.string().trim().min(2).max(60), status: z.enum(controlStatuses).optional(),
  }).parse(req.body);
  try {
    const control = await prisma.$transaction(async tx => {
      const created = await tx.control.create({ data: { ...input, organizationId: req.auth!.organizationId } });
      await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'risk.control_created', targetType: 'control', targetId: created.id } });
      return created;
    });
    res.status(201).json({ data: control });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'CONTROL_ALREADY_EXISTS', 'A control with this name already exists in this workspace.');
    throw error;
  }
});

riskRouter.patch('/controls/:controlId/status', requirePermission('continuity:write'), async (req, res) => {
  const controlId = z.string().uuid().parse(req.params.controlId);
  const input = z.object({ status: z.enum(controlStatuses), testEvidence: z.string().trim().min(20).max(5000).optional() }).parse(req.body);
  if (input.status === 'TESTED' && !input.testEvidence) throw new AppError(400, 'CONTROL_TEST_EVIDENCE_REQUIRED', 'A test result and evidence summary are required before a control can be marked tested.');
  const current = await prisma.control.findFirst({ where: { id: controlId, organizationId: req.auth!.organizationId } });
  if (!current) throw new AppError(404, 'CONTROL_NOT_FOUND', 'The control was not found.');
  const updated = await prisma.$transaction(async tx => {
    const record = await tx.control.update({ where: { id: controlId }, data: { status: input.status } });
    await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'risk.control_status_changed', targetType: 'control', targetId: controlId, metadata: { from: current.status, to: input.status, testEvidence: input.testEvidence ?? null } } });
    return record;
  });
  res.json({ data: updated });
});

riskRouter.post('/:riskId/controls', requirePermission('continuity:write'), async (req, res) => {
  const riskId = z.string().uuid().parse(req.params.riskId);
  const input = z.object({ controlId: z.string().uuid(), effectiveness: z.number().int().min(0).max(100), notes: z.string().max(5000).optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const [risk, control] = await Promise.all([
    prisma.risk.findFirst({ where: { id: riskId, organizationId }, select: { id: true } }),
    prisma.control.findFirst({ where: { id: input.controlId, organizationId }, select: { id: true, status: true } }),
  ]);
  if (!risk || !control) throw new AppError(404, 'RISK_OR_CONTROL_NOT_FOUND', 'The risk and control must both belong to this workspace.');
  if (control.status !== 'TESTED' && input.effectiveness > 0) throw new AppError(409, 'CONTROL_NOT_TESTED', 'Only tested controls may reduce residual risk.');
  const link = await prisma.$transaction(async tx => {
    const created = await tx.riskControl.create({ data: { riskId, controlId: input.controlId, effectiveness: input.effectiveness, lastTestedAt: control.status === 'TESTED' ? new Date() : null, notes: input.notes } });
    const all = await tx.riskControl.findMany({ where: { riskId }, select: { effectiveness: true } });
    const source = await tx.risk.findUniqueOrThrow({ where: { id: riskId }, select: { inherentScore: true } });
    const residualScore = calculateResidualRisk(source.inherentScore, all.map(item => item.effectiveness));
    await tx.risk.update({ where: { id: riskId }, data: { residualScore } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'risk.control_linked', targetType: 'risk', targetId: riskId, metadata: { controlId: input.controlId, residualScore } } });
    return created;
  });
  res.status(201).json({ data: link });
});

riskRouter.patch('/:riskId/controls/:linkId', requirePermission('continuity:write'), async (req, res) => {
  const riskId = z.string().uuid().parse(req.params.riskId);
  const linkId = z.string().uuid().parse(req.params.linkId);
  const input = z.object({ effectiveness: z.number().int().min(0).max(100), notes: z.string().max(5000).optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const link = await prisma.riskControl.findFirst({ where: { id: linkId, riskId, risk: { organizationId }, control: { organizationId } }, include: { control: true } });
  if (!link) throw new AppError(404, 'RISK_CONTROL_NOT_FOUND', 'The risk-control association was not found.');
  if (link.control.status !== 'TESTED' && input.effectiveness > 0) throw new AppError(409, 'CONTROL_NOT_TESTED', 'Only tested controls may reduce residual risk.');
  await prisma.$transaction(async tx => {
    await tx.riskControl.update({ where: { id: linkId }, data: { effectiveness: input.effectiveness, notes: input.notes, lastTestedAt: link.control.status === 'TESTED' ? new Date() : null } });
    const all = await tx.riskControl.findMany({ where: { riskId }, select: { effectiveness: true } });
    const source = await tx.risk.findUniqueOrThrow({ where: { id: riskId }, select: { inherentScore: true } });
    await tx.risk.update({ where: { id: riskId }, data: { residualScore: calculateResidualRisk(source.inherentScore, all.map(item => item.effectiveness)) } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'risk.control_assessed', targetType: 'risk_control', targetId: linkId, metadata: { effectiveness: input.effectiveness } } });
  });
  res.json({ data: { id: linkId, effectiveness: input.effectiveness } });
});

riskRouter.patch('/:riskId/status', requirePermission('continuity:write'), async (req, res) => {
  const riskId = z.string().uuid().parse(req.params.riskId);
  const input = z.object({ status: z.enum(riskStatuses) }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.risk.findFirst({ where: { id: riskId, organizationId } });
  if (!current) throw new AppError(404, 'RISK_NOT_FOUND', 'The risk was not found.');
  const allowed: Record<string, string[]> = { IDENTIFIED: ['ASSESSED', 'CLOSED'], ASSESSED: ['TREATING', 'ACCEPTED', 'CLOSED'], TREATING: ['ASSESSED', 'ACCEPTED', 'CLOSED'], ACCEPTED: ['ASSESSED', 'CLOSED'], CLOSED: [] };
  if (!(allowed[current.status] ?? []).includes(input.status)) throw new AppError(409, 'RISK_INVALID_TRANSITION', 'This risk status transition is not permitted.');
  const updated = await prisma.$transaction(async tx => {
    const record = await tx.risk.update({ where: { id: riskId }, data: { status: input.status }, include: includeRisk() });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'risk.status_changed', targetType: 'risk', targetId: riskId, metadata: { from: current.status, to: input.status } } });
    return record;
  });
  res.json({ data: updated });
});

riskRouter.post('/:riskId/treatments', requirePermission('continuity:write'), async (req, res) => {
  const riskId = z.string().uuid().parse(req.params.riskId);
  const input = z.object({ title: z.string().trim().min(3).max(180), ownerName: z.string().trim().min(2).max(120), dueAt: z.string().datetime(), notes: z.string().max(5000).optional() }).parse(req.body);
  const risk = await prisma.risk.findFirst({ where: { id: riskId, organizationId: req.auth!.organizationId }, select: { id: true } });
  if (!risk) throw new AppError(404, 'RISK_NOT_FOUND', 'The risk was not found.');
  const treatment = await prisma.$transaction(async tx => {
    const created = await tx.riskTreatment.create({ data: { ...input, riskId, dueAt: new Date(input.dueAt) } });
    await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'risk.treatment_created', targetType: 'risk_treatment', targetId: created.id } });
    return created;
  });
  res.status(201).json({ data: treatment });
});

riskRouter.patch('/:riskId/treatments/:treatmentId', requirePermission('continuity:write'), async (req, res) => {
  const riskId = z.string().uuid().parse(req.params.riskId);
  const treatmentId = z.string().uuid().parse(req.params.treatmentId);
  const input = z.object({ status: z.enum(treatmentStatuses), notes: z.string().max(5000).optional() }).parse(req.body);
  const current = await prisma.riskTreatment.findFirst({ where: { id: treatmentId, riskId, risk: { organizationId: req.auth!.organizationId } } });
  if (!current) throw new AppError(404, 'RISK_TREATMENT_NOT_FOUND', 'The treatment action was not found.');
  const completedAt = input.status === 'COMPLETED' ? new Date() : null;
  const updated = await prisma.$transaction(async tx => {
    const record = await tx.riskTreatment.update({ where: { id: treatmentId }, data: { status: input.status, notes: input.notes, completedAt } });
    await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'risk.treatment_updated', targetType: 'risk_treatment', targetId: treatmentId, metadata: { status: input.status } } });
    return record;
  });
  res.json({ data: updated });
});
