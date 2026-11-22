import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { canTransitionIncident } from '../lib/incident-lifecycle.js';

export const incidentRouter = Router();
incidentRouter.use(requireAuth);

const severities = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
const statuses = ['DETECTED', 'TRIAGED', 'ACTIVE', 'MITIGATING', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
const taskStatuses = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const;
const includeDetails = {
  events: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  tasks: { orderBy: [{ status: 'asc' as const }, { dueAt: 'asc' as const }] },
};

incidentRouter.get('/summary', async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const records = await prisma.incident.findMany({
    where: { organizationId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    select: { severity: true, status: true, detectedAt: true, acknowledgedAt: true, resolvedAt: true },
  });
  const open = records.filter(item => !['RESOLVED'].includes(item.status));
  const acknowledged = records.filter(item => item.acknowledgedAt);
  const avg = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  res.json({ data: {
    open: open.length,
    critical: open.filter(item => item.severity === 'SEV1').length,
    major: open.filter(item => item.severity === 'SEV2').length,
    awaitingTriage: records.filter(item => item.status === 'DETECTED').length,
    resolved: records.filter(item => item.status === 'RESOLVED').length,
    averageAcknowledgeMinutes: avg(acknowledged.map(item => (item.acknowledgedAt!.getTime() - item.detectedAt.getTime()) / 60000)),
  } });
});

incidentRouter.get('/', async (req, res) => {
  const query = z.object({
    status: z.enum(statuses).optional(),
    severity: z.enum(severities).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(req.query);
  const incidents = await prisma.incident.findMany({
    where: {
      organizationId: req.auth!.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
    },
    include: includeDetails,
    orderBy: [{ detectedAt: 'desc' }],
    take: query.limit,
  });
  res.json({ data: incidents });
});

incidentRouter.post('/', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({
    title: z.string().trim().min(5).max(180),
    description: z.string().trim().min(20).max(10000),
    category: z.string().trim().min(2).max(80),
    source: z.string().trim().min(2).max(80),
    severity: z.enum(severities).default('SEV3'),
    commanderName: z.string().trim().min(2).max(120),
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const reference = `INC-${new Date().toISOString().slice(0,10).replaceAll('-', '')}-${randomUUID().slice(0,6).toUpperCase()}`;
  const incident = await prisma.$transaction(async tx => {
    const created = await tx.incident.create({
      data: { ...input, reference, organizationId },
      include: includeDetails,
    });
    await tx.incidentEvent.create({
      data: { incidentId: created.id, actorUserId: req.auth!.userId, eventType: 'DECLARED', message: 'Incident declared and response record opened.' },
    });
    await tx.auditEvent.create({
      data: { organizationId, actorUserId: req.auth!.userId, action: 'incident.declared', targetType: 'incident', targetId: created.id, metadata: { reference, severity: input.severity } },
    });
    return created;
  });
  res.status(201).json({ data: incident });
});

incidentRouter.patch('/:incidentId/status', requirePermission('continuity:write'), async (req, res) => {
  const incidentId = z.string().uuid().parse(req.params.incidentId);
  const input = z.object({ status: z.enum(statuses), message: z.string().trim().min(5).max(3000).optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.incident.findFirst({ where: { id: incidentId, organizationId } });
  if (!current) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'The incident was not found in this workspace.');
  if (!canTransitionIncident(current.status, input.status)) {
    throw new AppError(409, 'INCIDENT_INVALID_TRANSITION', `Cannot move an incident from ${current.status} to ${input.status}.`);
  }
  const now = new Date();
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.incident.updateMany({
      where: { id: incidentId, organizationId, status: current.status },
      data: {
        status: input.status,
        ...(input.status === 'TRIAGED' && !current.acknowledgedAt ? { acknowledgedAt: now } : {}),
        ...(input.status === 'RESOLVED' ? { resolvedAt: now } : {}),
        ...(input.status === 'ACTIVE' && current.status === 'RESOLVED' ? { resolvedAt: null } : {}),
        ...(input.status === 'CLOSED' ? { closedAt: now } : {}),
      },
    });
    if (changed.count !== 1) throw new AppError(409, 'INCIDENT_CONCURRENT_UPDATE', 'The incident changed while this action was being processed. Refresh and try again.');
    const record = await tx.incident.findFirstOrThrow({ where: { id: incidentId, organizationId }, include: includeDetails });
    await tx.incidentEvent.create({
      data: { incidentId, actorUserId: req.auth!.userId, eventType: 'STATUS_CHANGED', message: input.message ?? `Status changed from ${current.status} to ${input.status}.`, metadata: { from: current.status, to: input.status } },
    });
    await tx.auditEvent.create({
      data: { organizationId, actorUserId: req.auth!.userId, action: 'incident.status_changed', targetType: 'incident', targetId: incidentId, metadata: { from: current.status, to: input.status } },
    });
    return record;
  });
  res.json({ data: updated });
});

incidentRouter.patch('/:incidentId/severity', requirePermission('continuity:write'), async (req, res) => {
  const incidentId = z.string().uuid().parse(req.params.incidentId);
  const input = z.object({ severity: z.enum(severities), rationale: z.string().trim().min(10).max(2000) }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.incident.findFirst({ where: { id: incidentId, organizationId }, select: { id: true, severity: true } });
  if (!current) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'The incident was not found in this workspace.');
  const updated = await prisma.$transaction(async tx => {
    const record = await tx.incident.update({ where: { id: incidentId }, data: { severity: input.severity }, include: includeDetails });
    await tx.incidentEvent.create({ data: { incidentId, actorUserId: req.auth!.userId, eventType: 'SEVERITY_CHANGED', message: input.rationale, metadata: { from: current.severity, to: input.severity } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'incident.severity_changed', targetType: 'incident', targetId: incidentId, metadata: { from: current.severity, to: input.severity } } });
    return record;
  });
  res.json({ data: updated });
});

incidentRouter.post('/:incidentId/events', requirePermission('continuity:write'), async (req, res) => {
  const incidentId = z.string().uuid().parse(req.params.incidentId);
  const input = z.object({ eventType: z.enum(['UPDATE', 'DECISION', 'IMPACT', 'COMMUNICATION']), message: z.string().trim().min(5).max(3000) }).parse(req.body);
  const incident = await prisma.incident.findFirst({ where: { id: incidentId, organizationId: req.auth!.organizationId }, select: { id: true } });
  if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'The incident was not found in this workspace.');
  const event = await prisma.$transaction(async tx => {
    const created = await tx.incidentEvent.create({ data: { incidentId, actorUserId: req.auth!.userId, ...input } });
    await tx.auditEvent.create({ data: { organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, action: 'incident.timeline_entry_added', targetType: 'incident', targetId: incidentId, metadata: { eventType: input.eventType } } });
    return created;
  });
  res.status(201).json({ data: event });
});

incidentRouter.post('/:incidentId/tasks', requirePermission('continuity:write'), async (req, res) => {
  const incidentId = z.string().uuid().parse(req.params.incidentId);
  const input = z.object({
    title: z.string().trim().min(4).max(180),
    ownerName: z.string().trim().min(2).max(120),
    priority: z.enum(severities).default('SEV3'),
    dueAt: z.string().datetime(),
    notes: z.string().max(3000).optional(),
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const incident = await prisma.incident.findFirst({ where: { id: incidentId, organizationId }, select: { id: true } });
  if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'The incident was not found in this workspace.');
  const task = await prisma.$transaction(async tx => {
    const created = await tx.incidentTask.create({ data: { incidentId, title: input.title, ownerName: input.ownerName, priority: input.priority, dueAt: new Date(input.dueAt), ...(input.notes !== undefined ? { notes: input.notes } : {}) } });
    await tx.incidentEvent.create({ data: { incidentId, actorUserId: req.auth!.userId, eventType: 'TASK_CREATED', message: `Response action assigned to ${input.ownerName}: ${input.title}`, metadata: { taskId: created.id } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'incident.task_created', targetType: 'incident_task', targetId: created.id, metadata: { incidentId } } });
    return created;
  });
  res.status(201).json({ data: task });
});

incidentRouter.patch('/:incidentId/tasks/:taskId', requirePermission('continuity:write'), async (req, res) => {
  const incidentId = z.string().uuid().parse(req.params.incidentId);
  const taskId = z.string().uuid().parse(req.params.taskId);
  const input = z.object({ status: z.enum(taskStatuses), notes: z.string().max(3000).optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.incidentTask.findFirst({ where: { id: taskId, incidentId, incident: { organizationId } }, select: { id: true, status: true } });
  if (!current) throw new AppError(404, 'INCIDENT_TASK_NOT_FOUND', 'The response action was not found in this workspace.');
  const updated = await prisma.$transaction(async tx => {
    const task = await tx.incidentTask.update({ where: { id: taskId }, data: { status: input.status, ...(input.notes !== undefined ? { notes: input.notes } : {}), completedAt: input.status === 'COMPLETED' ? new Date() : null } });
    await tx.incidentEvent.create({ data: { incidentId, actorUserId: req.auth!.userId, eventType: 'TASK_UPDATED', message: `Response action "${task.title}" moved to ${input.status}.`, metadata: { taskId, from: current.status, to: input.status } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'incident.task_updated', targetType: 'incident_task', targetId: taskId, metadata: { incidentId, from: current.status, to: input.status } } });
    return task;
  });
  res.json({ data: updated });
});
