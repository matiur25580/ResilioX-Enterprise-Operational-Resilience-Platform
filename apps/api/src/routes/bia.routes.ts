import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { classifyCriticality, calculateImpactScore, impactHorizons } from '../lib/bia-scoring.js';

export const biaRouter = Router();
biaRouter.use(requireAuth);

const horizonSchema = z.enum(impactHorizons);
const snapshotSchema = z.object({
  horizon: horizonSchema,
  financial: z.number().int().min(1).max(5),
  operational: z.number().int().min(1).max(5),
  regulatory: z.number().int().min(1).max(5),
  reputational: z.number().int().min(1).max(5),
});
const assessmentSchema = z.object({
  processId: z.string().uuid(),
  ownerName: z.string().trim().min(2).max(120),
  mtpdMinutes: z.number().int().positive().max(525600),
  rtoMinutes: z.number().int().positive().max(525600),
  rpoMinutes: z.number().int().min(0).max(525600),
  rationale: z.string().trim().min(10).max(10000),
  reviewDueAt: z.string().datetime().optional(),
  impacts: z.array(snapshotSchema).length(impactHorizons.length),
}).superRefine((value, ctx) => {
  if (value.rtoMinutes > value.mtpdMinutes) ctx.addIssue({ code: 'custom', path: ['rtoMinutes'], message: 'RTO must not exceed MTPD.' });
  if (new Set(value.impacts.map(item => item.horizon)).size !== impactHorizons.length) ctx.addIssue({ code: 'custom', path: ['impacts'], message: 'Provide exactly one impact score for every time horizon.' });
});

function includeAssessment() {
  return { process: { select: { id: true, name: true, ownerName: true } }, impacts: { orderBy: { horizon: 'asc' as const } } };
}

biaRouter.get('/processes', async (req, res) => {
  const processes = await prisma.businessProcess.findMany({ where: { organizationId: req.auth!.organizationId }, orderBy: { name: 'asc' }, select: { id: true, name: true, ownerName: true } });
  res.json({ data: processes });
});

biaRouter.get('/', async (req, res) => {
  const assessments = await prisma.businessImpactAssessment.findMany({
    where: { organizationId: req.auth!.organizationId, status: { not: 'RETIRED' } },
    include: includeAssessment(), orderBy: [{ updatedAt: 'desc' }],
  });
  res.json({ data: assessments });
});

biaRouter.get('/:assessmentId', async (req, res) => {
  const assessmentId = z.string().uuid().parse(req.params.assessmentId);
  const assessment = await prisma.businessImpactAssessment.findFirst({
    where: { id: assessmentId, organizationId: req.auth!.organizationId }, include: includeAssessment(),
  });
  if (!assessment) throw new AppError(404, 'BIA_ASSESSMENT_NOT_FOUND', 'The business impact assessment was not found.');
  res.json({ data: assessment });
});

biaRouter.post('/', requirePermission('continuity:write'), async (req, res) => {
  const input = assessmentSchema.parse(req.body);
  const organizationId = req.auth!.organizationId;
  const process = await prisma.businessProcess.findFirst({ where: { id: input.processId, organizationId }, select: { id: true } });
  if (!process) throw new AppError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'The business process was not found in this workspace.');
  const score = calculateImpactScore(input.impacts);
  const latest = await prisma.businessImpactAssessment.findFirst({ where: { organizationId, processId: input.processId }, orderBy: { version: 'desc' }, select: { version: true } });
  const assessment = await prisma.$transaction(async tx => {
    const created = await tx.businessImpactAssessment.create({
      data: {
        organizationId, processId: input.processId, version: (latest?.version ?? 0) + 1,
        ownerName: input.ownerName, mtpdMinutes: input.mtpdMinutes, rtoMinutes: input.rtoMinutes,
        rpoMinutes: input.rpoMinutes, rationale: input.rationale, reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : null,
        impactScore: score, criticality: classifyCriticality(score),
        impacts: { create: input.impacts },
      }, include: includeAssessment(),
    });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'bia.assessment_created', targetType: 'business_impact_assessment', targetId: created.id, metadata: { processId: input.processId, version: created.version, impactScore: score } } });
    return created;
  });
  res.status(201).json({ data: assessment });
});

biaRouter.post('/:assessmentId/submit', requirePermission('continuity:write'), async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const assessmentId = z.string().uuid().parse(req.params.assessmentId);
  const current = await prisma.businessImpactAssessment.findFirst({ where: { id: assessmentId, organizationId }, select: { id: true, status: true } });
  if (!current) throw new AppError(404, 'BIA_ASSESSMENT_NOT_FOUND', 'The business impact assessment was not found.');
  if (current.status !== 'DRAFT') throw new AppError(409, 'BIA_INVALID_TRANSITION', 'Only draft assessments can be submitted for review.');
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.businessImpactAssessment.update({ where: { id: current.id }, data: { status: 'IN_REVIEW', submittedAt: new Date() }, include: includeAssessment() });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'bia.assessment_submitted', targetType: 'business_impact_assessment', targetId: current.id } });
    return updated;
  });
  res.json({ data: result });
});

biaRouter.post('/:assessmentId/approve', requirePermission('continuity:write'), async (req, res) => {
  if (!['OWNER', 'ADMIN', 'RESILIENCE_MANAGER'].includes(req.auth!.role)) throw new AppError(403, 'BIA_APPROVAL_FORBIDDEN', 'Only workspace owners, administrators and resilience managers can approve assessments.');
  const organizationId = req.auth!.organizationId;
  const current = await prisma.businessImpactAssessment.findFirst({ where: { id: req.params.assessmentId, organizationId }, select: { id: true, status: true } });
  if (!current) throw new AppError(404, 'BIA_ASSESSMENT_NOT_FOUND', 'The business impact assessment was not found.');
  if (current.status !== 'IN_REVIEW') throw new AppError(409, 'BIA_INVALID_TRANSITION', 'Only assessments in review can be approved.');
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.businessImpactAssessment.update({ where: { id: current.id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: req.auth!.userId }, include: includeAssessment() });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'bia.assessment_approved', targetType: 'business_impact_assessment', targetId: current.id } });
    return updated;
  });
  res.json({ data: result });
});
