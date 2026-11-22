import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const governanceRouter = Router();
governanceRouter.use(requireAuth);

const reviewers = ['OWNER', 'ADMIN', 'RESILIENCE_MANAGER'];
const evidenceInclude = { createdBy: { select: { id: true, displayName: true } }, reviewedBy: { select: { id: true, displayName: true } } };
const policyInclude = { owner: { select: { id: true, displayName: true } }, submittedBy: { select: { id: true, displayName: true } }, approvedBy: { select: { id: true, displayName: true } }, evidenceLinks: { include: { evidence: { select: { id: true, title: true, evidenceType: true, status: true, expiresAt: true } } } } };

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret|cookie|authorization|credential|api.?key|session|ip.?address/i.test(key)) continue;
    result[key] = redact(item);
  }
  return result;
}

governanceRouter.get('/audit/events', requirePermission('audit:read'), async (req, res) => {
  const query = z.object({
    action: z.string().trim().max(120).optional(),
    targetType: z.string().trim().max(80).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(req.query);
  const organizationId = req.auth!.organizationId;
  const cursor = query.cursor ? await prisma.auditEvent.findFirst({ where: { id: query.cursor, organizationId }, select: { id: true, createdAt: true } }) : null;
  if (query.cursor && !cursor) throw new AppError(400, 'AUDIT_CURSOR_INVALID', 'The audit cursor is invalid for this workspace.');
  const events = await prisma.auditEvent.findMany({
    where: {
      organizationId,
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
    include: { actor: { select: { id: true, displayName: true } } },
  });
  const hasMore = events.length > query.limit;
  const page = events.slice(0, query.limit);
  res.json({ data: page.map(event => ({
    id: event.id, action: event.action, targetType: event.targetType, targetId: event.targetId,
    actor: event.actor, occurredAt: event.createdAt, metadata: redact(event.metadata),
  })), pagination: { limit: query.limit, nextCursor: hasMore ? page.at(-1)?.id ?? null : null, hasMore } });
});

governanceRouter.get('/evidence', async (req, res) => {
  const query = z.object({ status: z.enum(['DRAFT','SUBMITTED','VERIFIED','REJECTED','EXPIRED']).optional(), targetType: z.string().max(80).optional() }).parse(req.query);
  const records = await prisma.governanceEvidence.findMany({
    where: { organizationId: req.auth!.organizationId, ...(query.status ? { status: query.status } : {}), ...(query.targetType ? { targetType: query.targetType } : {}) },
    include: evidenceInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 200,
  });
  res.json({ data: records.map(record => ({ ...record, isExpired: !!record.expiresAt && record.expiresAt < new Date() })) });
});

governanceRouter.post('/evidence', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({
    title: z.string().trim().min(3).max(180), evidenceType: z.enum(['POLICY','DOCUMENT','AUDIT_REPORT','CERTIFICATION','TEST_RESULT','EXERCISE_RESULT','CONTRACT','OTHER']),
    referenceUri: z.string().url().max(1000).refine(value => ['https:', 'http:'].includes(new URL(value).protocol), 'Evidence reference must use HTTP or HTTPS.'),
    description: z.string().trim().max(10000).optional(), targetType: z.string().trim().max(80).optional(), targetId: z.string().trim().max(120).optional(),
    issuedAt: z.string().datetime().optional(), expiresAt: z.string().datetime().optional(), checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  }).refine(value => !value.expiresAt || !value.issuedAt || new Date(value.expiresAt) >= new Date(value.issuedAt), { message: 'Expiry must not precede issue date.', path: ['expiresAt'] }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const created = await prisma.$transaction(async tx => {
    const record = await tx.governanceEvidence.create({ data: {
      ...input, organizationId, createdByUserId: req.auth!.userId,
      description: input.description ?? null, targetType: input.targetType ?? null, targetId: input.targetId ?? null,
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      checksumSha256: input.checksumSha256?.toLowerCase() ?? null,
    }, include: evidenceInclude });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.evidence.created', targetType: 'governance_evidence', targetId: record.id, metadata: { evidenceType: record.evidenceType, status: record.status } } });
    return record;
  });
  res.status(201).json({ data: created });
});

governanceRouter.post('/evidence/:evidenceId/submit', requirePermission('continuity:write'), async (req, res) => {
  const id = z.string().uuid().parse(req.params.evidenceId), organizationId = req.auth!.organizationId;
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.governanceEvidence.updateMany({ where: { id, organizationId, status: 'DRAFT' }, data: { status: 'SUBMITTED' } });
    if (!changed.count) {
      const exists = await tx.governanceEvidence.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!exists) throw new AppError(404, 'GOVERNANCE_EVIDENCE_NOT_FOUND', 'Evidence was not found in this workspace.');
      throw new AppError(409, 'GOVERNANCE_EVIDENCE_INVALID_TRANSITION', 'Only draft evidence can be submitted.');
    }
    const record = await tx.governanceEvidence.findFirstOrThrow({ where: { id, organizationId }, include: evidenceInclude });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.evidence.submitted', targetType: 'governance_evidence', targetId: id } });
    return record;
  });
  res.json({ data: updated });
});

governanceRouter.post('/evidence/:evidenceId/review', requirePermission('continuity:write'), async (req, res) => {
  const id = z.string().uuid().parse(req.params.evidenceId), organizationId = req.auth!.organizationId;
  if (!reviewers.includes(req.auth!.role)) throw new AppError(403, 'GOVERNANCE_REVIEW_FORBIDDEN', 'Only workspace owners, administrators and resilience managers can review evidence.');
  const input = z.object({ decision: z.enum(['VERIFIED','REJECTED']), rationale: z.string().trim().min(10).max(5000) }).parse(req.body);
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.governanceEvidence.findFirst({ where: { id, organizationId }, select: { id: true, status: true, createdByUserId: true } });
    if (!current) throw new AppError(404, 'GOVERNANCE_EVIDENCE_NOT_FOUND', 'Evidence was not found in this workspace.');
    if (current.status !== 'SUBMITTED') throw new AppError(409, 'GOVERNANCE_EVIDENCE_INVALID_TRANSITION', 'Only submitted evidence can be reviewed.');
    if (current.createdByUserId === req.auth!.userId) throw new AppError(403, 'GOVERNANCE_MAKER_CHECKER_REQUIRED', 'The evidence creator cannot review their own evidence.');
    const changed = await tx.governanceEvidence.updateMany({ where: { id, organizationId, status: 'SUBMITTED', createdByUserId: { not: req.auth!.userId } }, data: { status: input.decision, reviewedByUserId: req.auth!.userId, reviewedAt: new Date(), reviewRationale: input.rationale } });
    if (!changed.count) throw new AppError(409, 'GOVERNANCE_CONCURRENT_UPDATE', 'Evidence changed while being reviewed. Refresh and retry.');
    const record = await tx.governanceEvidence.findFirstOrThrow({ where: { id, organizationId }, include: evidenceInclude });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.evidence.reviewed', targetType: 'governance_evidence', targetId: id, metadata: { decision: input.decision } } });
    return record;
  });
  res.json({ data: updated });
});

governanceRouter.get('/policies', async (req, res) => {
  const records = await prisma.governancePolicy.findMany({ where: { organizationId: req.auth!.organizationId, status: { not: 'RETIRED' } }, include: policyInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 200 });
  res.json({ data: records });
});

governanceRouter.post('/policies', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({ name: z.string().trim().min(3).max(180), framework: z.string().trim().min(2).max(100), controlReference: z.string().trim().min(1).max(120), description: z.string().trim().min(20).max(10000), reviewDueAt: z.string().datetime().optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const created = await prisma.$transaction(async tx => {
    const policy = await tx.governancePolicy.create({ data: { ...input, organizationId, ownerUserId: req.auth!.userId, reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : null }, include: policyInclude });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.policy.created', targetType: 'governance_policy', targetId: policy.id, metadata: { framework: policy.framework, controlReference: policy.controlReference } } });
    return policy;
  });
  res.status(201).json({ data: created });
});

governanceRouter.post('/policies/:policyId/submit', requirePermission('continuity:write'), async (req, res) => {
  const id = z.string().uuid().parse(req.params.policyId), organizationId = req.auth!.organizationId;
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.governancePolicy.updateMany({ where: { id, organizationId, status: 'DRAFT' }, data: { status: 'IN_REVIEW', submittedByUserId: req.auth!.userId, submittedAt: new Date() } });
    if (!changed.count) {
      const exists = await tx.governancePolicy.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!exists) throw new AppError(404, 'GOVERNANCE_POLICY_NOT_FOUND', 'Policy was not found in this workspace.');
      throw new AppError(409, 'GOVERNANCE_POLICY_INVALID_TRANSITION', 'Only draft policies can be submitted.');
    }
    const policy = await tx.governancePolicy.findFirstOrThrow({ where: { id, organizationId }, include: policyInclude });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.policy.submitted', targetType: 'governance_policy', targetId: id } });
    return policy;
  });
  res.json({ data: updated });
});

governanceRouter.post('/policies/:policyId/approve', requirePermission('continuity:write'), async (req, res) => {
  const id = z.string().uuid().parse(req.params.policyId), organizationId = req.auth!.organizationId;
  if (!reviewers.includes(req.auth!.role)) throw new AppError(403, 'GOVERNANCE_APPROVAL_FORBIDDEN', 'Only workspace owners, administrators and resilience managers can approve policies.');
  const input = z.object({ rationale: z.string().trim().min(10).max(5000) }).parse(req.body);
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.governancePolicy.findFirst({ where: { id, organizationId }, select: { id: true, status: true, submittedByUserId: true } });
    if (!current) throw new AppError(404, 'GOVERNANCE_POLICY_NOT_FOUND', 'Policy was not found in this workspace.');
    if (current.status !== 'IN_REVIEW') throw new AppError(409, 'GOVERNANCE_POLICY_INVALID_TRANSITION', 'Only policies in review can be approved.');
    if (current.submittedByUserId === req.auth!.userId) throw new AppError(403, 'GOVERNANCE_MAKER_CHECKER_REQUIRED', 'The policy submitter cannot approve their own policy.');
    const changed = await tx.governancePolicy.updateMany({ where: { id, organizationId, status: 'IN_REVIEW', submittedByUserId: { not: req.auth!.userId } }, data: { status: 'ACTIVE', approvedByUserId: req.auth!.userId, approvedAt: new Date() } });
    if (!changed.count) throw new AppError(409, 'GOVERNANCE_CONCURRENT_UPDATE', 'Policy changed while being approved. Refresh and retry.');
    const policy = await tx.governancePolicy.findFirstOrThrow({ where: { id, organizationId }, include: policyInclude });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.policy.approved', targetType: 'governance_policy', targetId: id, metadata: { rationale: input.rationale } } });
    return policy;
  });
  res.json({ data: updated });
});

governanceRouter.post('/policies/:policyId/evidence', requirePermission('continuity:write'), async (req, res) => {
  const policyId = z.string().uuid().parse(req.params.policyId), organizationId = req.auth!.organizationId;
  const input = z.object({ evidenceId: z.string().uuid() }).parse(req.body);
  const created = await prisma.$transaction(async tx => {
    const [policy, evidence] = await Promise.all([
      tx.governancePolicy.findFirst({ where: { id: policyId, organizationId, status: 'ACTIVE' }, select: { id: true } }),
      tx.governanceEvidence.findFirst({ where: { id: input.evidenceId, organizationId, status: 'VERIFIED', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } }),
    ]);
    if (!policy) throw new AppError(404, 'GOVERNANCE_POLICY_NOT_FOUND', 'An active policy in this workspace was not found.');
    if (!evidence) throw new AppError(404, 'GOVERNANCE_EVIDENCE_NOT_VERIFIED', 'Verified, unexpired evidence in this workspace is required.');
    const link = await tx.policyEvidenceLink.create({ data: { organizationId, policyId, evidenceId: input.evidenceId, createdByUserId: req.auth!.userId }, include: { evidence: { select: { id: true, title: true, status: true } } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.policy_evidence.linked', targetType: 'governance_policy', targetId: policyId, metadata: { evidenceId: input.evidenceId } } });
    return link;
  });
  res.status(201).json({ data: created });
});

governanceRouter.post('/policies/:policyId/retire', requirePermission('continuity:write'), async (req, res) => {
  const id = z.string().uuid().parse(req.params.policyId), organizationId = req.auth!.organizationId;
  if (!reviewers.includes(req.auth!.role)) throw new AppError(403, 'GOVERNANCE_RETIRE_FORBIDDEN', 'Only workspace owners, administrators and resilience managers can retire policies.');
  const changed = await prisma.$transaction(async tx => {
    const result = await tx.governancePolicy.updateMany({ where: { id, organizationId, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
    if (!result.count) throw new AppError(404, 'GOVERNANCE_POLICY_NOT_ACTIVE', 'An active policy in this workspace was not found.');
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'governance.policy.retired', targetType: 'governance_policy', targetId: id } });
    return tx.governancePolicy.findFirstOrThrow({ where: { id, organizationId }, include: policyInclude });
  });
  res.json({ data: changed });
});
