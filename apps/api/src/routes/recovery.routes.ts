import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { canApproveRunbook, canStartRecoveryStep, canTransitionRecoveryStep, compareRecoveryTarget, hasDependencyCycle, isSimulationReady } from '../lib/recovery-orchestration.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const recoveryRouter = Router();
recoveryRouter.use(requireAuth);

const runbookInclude = {
  steps: {
    orderBy: { sequence: 'asc' as const },
    include: {
      predecessors: { select: { predecessorStepId: true } },
      successors: { select: { successorStepId: true } },
    },
  },
};

recoveryRouter.get('/runbooks', async (req, res) => {
  const query = z.object({
    status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'RETIRED']).optional(),
    serviceId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(req.query);
  const data = await prisma.recoveryRunbook.findMany({
    where: {
      organizationId: req.auth!.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
    },
    include: runbookInclude,
    orderBy: [{ updatedAt: 'desc' }],
    take: query.limit,
  });
  res.json({ data });
});

recoveryRouter.get('/runbooks/:runbookId', async (req, res) => {
  const runbookId = z.string().uuid().parse(req.params.runbookId);
  const data = await prisma.recoveryRunbook.findFirst({
    where: { id: runbookId, organizationId: req.auth!.organizationId },
    include: { ...runbookInclude, service: { select: { id: true, name: true, criticality: true, ownerName: true } }, continuityPlan: { select: { id: true, title: true, version: true, rtoMinutes: true, rpoMinutes: true, status: true } }, simulations: { select: { id: true, status: true, createdAt: true, completedAt: true }, orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!data) throw new AppError(404, 'RECOVERY_RUNBOOK_NOT_FOUND', 'The recovery runbook was not found.');
  res.json({ data });
});

recoveryRouter.post('/runbooks', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({
    serviceId: z.string().uuid(),
    continuityPlanId: z.string().uuid().optional(),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(10000),
    ownerName: z.string().trim().min(2).max(120),
    rtoMinutes: z.number().int().positive().max(525600).optional(),
    rpoMinutes: z.number().int().min(0).max(525600).optional(),
    reviewDueAt: z.string().datetime().optional(),
    steps: z.array(z.object({
      sequence: z.number().int().min(1).max(100),
      title: z.string().trim().min(3).max(180),
      description: z.string().trim().min(5).max(5000),
      responsibleRole: z.string().trim().min(2).max(100),
      estimatedMinutes: z.number().int().positive().max(10080),
      validationCriteria: z.string().trim().min(3).max(3000),
      dependsOn: z.array(z.number().int().min(1).max(100)).max(100).default([]),
    })).min(1).max(100),
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const service = await prisma.businessService.findFirst({
    where: { id: input.serviceId, organizationId },
    select: { id: true },
  });
  if (!service) throw new AppError(404, 'RECOVERY_SERVICE_NOT_FOUND', 'The business service was not found in this workspace.');

  let plan: { id: string; rtoMinutes: number; rpoMinutes: number } | null = null;
  if (input.continuityPlanId) {
    plan = await prisma.continuityPlan.findFirst({
      where: { id: input.continuityPlanId, organizationId, serviceId: input.serviceId, status: 'APPROVED' },
      select: { id: true, rtoMinutes: true, rpoMinutes: true },
    });
    if (!plan) throw new AppError(422, 'RECOVERY_CONTINUITY_PLAN_INVALID', 'The continuity plan must be approved and belong to this service and workspace.');
  }
  const sequences = input.steps.map(step => step.sequence);
  if (new Set(sequences).size !== sequences.length) throw new AppError(422, 'RECOVERY_STEP_SEQUENCE_DUPLICATE', 'Recovery step sequence values must be unique.');
  const edges = input.steps.flatMap(step => step.dependsOn.map(predecessor => ({ predecessorId: String(predecessor), successorId: String(step.sequence) })));
  if (edges.some(edge => !sequences.includes(Number(edge.predecessorId)) || edge.predecessorId === edge.successorId)
    || hasDependencyCycle(sequences.map(String), edges)) {
    throw new AppError(422, 'RECOVERY_STEP_DEPENDENCY_INVALID', 'Step prerequisites must reference existing, different steps and must not contain cycles.');
  }

  const created = await prisma.$transaction(async tx => {
    const runbook = await tx.recoveryRunbook.create({
      data: {
        organizationId,
        serviceId: input.serviceId,
        continuityPlanId: plan?.id,
        title: input.title,
        description: input.description,
        ownerName: input.ownerName,
        rtoMinutes: plan?.rtoMinutes ?? input.rtoMinutes ?? null,
        rpoMinutes: plan?.rpoMinutes ?? input.rpoMinutes ?? null,
        reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : null,
        createdByUserId: req.auth!.userId,
      },
    });
    const stepBySequence = new Map<number, string>();
    for (const step of [...input.steps].sort((a, b) => a.sequence - b.sequence)) {
      const createdStep = await tx.recoveryRunbookStep.create({
        data: {
          runbookId: runbook.id,
          sequence: step.sequence,
          title: step.title,
          description: step.description,
          responsibleRole: step.responsibleRole,
          estimatedMinutes: step.estimatedMinutes,
          validationCriteria: step.validationCriteria,
        },
      });
      stepBySequence.set(step.sequence, createdStep.id);
    }
    const dependencies = edges.map(edge => ({
      predecessorStepId: stepBySequence.get(Number(edge.predecessorId))!,
      successorStepId: stepBySequence.get(Number(edge.successorId))!,
    }));
    if (dependencies.length) await tx.recoveryStepDependency.createMany({ data: dependencies });
    await tx.auditEvent.create({
      data: { organizationId, actorUserId: req.auth!.userId, action: 'recovery.runbook_created', targetType: 'recovery_runbook', targetId: runbook.id, metadata: { stepCount: input.steps.length, continuityPlanId: plan?.id ?? null } },
    });
    return tx.recoveryRunbook.findFirstOrThrow({ where: { id: runbook.id }, include: runbookInclude });
  });
  res.status(201).json({ data: created });
});

recoveryRouter.post('/runbooks/:runbookId/submit', requirePermission('continuity:write'), async (req, res) => {
  const runbookId = z.string().uuid().parse(req.params.runbookId);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.recoveryRunbook.findFirst({ where: { id: runbookId, organizationId }, select: { id: true, status: true, steps: { select: { id: true } } } });
  if (!current) throw new AppError(404, 'RECOVERY_RUNBOOK_NOT_FOUND', 'The recovery runbook was not found.');
  if (current.status !== 'DRAFT' || current.steps.length === 0) throw new AppError(409, 'RECOVERY_RUNBOOK_NOT_SUBMITTABLE', 'Only a draft runbook with at least one step can be submitted.');
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.recoveryRunbook.updateMany({ where: { id: runbookId, organizationId, status: 'DRAFT' }, data: { status: 'IN_REVIEW', submittedAt: new Date() } });
    if (changed.count !== 1) throw new AppError(409, 'RECOVERY_RUNBOOK_CONCURRENT_UPDATE', 'The runbook changed while submitting. Refresh and try again.');
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'recovery.runbook_submitted', targetType: 'recovery_runbook', targetId: runbookId } });
    return tx.recoveryRunbook.findFirstOrThrow({ where: { id: runbookId }, include: runbookInclude });
  });
  res.json({ data: updated });
});

recoveryRouter.post('/runbooks/:runbookId/approve', requirePermission('continuity:write'), async (req, res) => {
  const runbookId = z.string().uuid().parse(req.params.runbookId);
  const input = z.object({ rationale: z.string().trim().max(2000).optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.recoveryRunbook.findFirst({ where: { id: runbookId, organizationId }, select: { id: true, status: true, createdByUserId: true } });
  if (!current) throw new AppError(404, 'RECOVERY_RUNBOOK_NOT_FOUND', 'The recovery runbook was not found.');
  if (current.status !== 'IN_REVIEW') throw new AppError(409, 'RECOVERY_RUNBOOK_NOT_IN_REVIEW', 'Only a runbook in review can be approved.');
  if (!canApproveRunbook(current.createdByUserId, req.auth!.userId)) throw new AppError(403, 'RECOVERY_MAKER_CHECKER_REQUIRED', 'The runbook author cannot approve their own submission.');
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.recoveryRunbook.updateMany({
      where: { id: runbookId, organizationId, status: 'IN_REVIEW', createdByUserId: { not: req.auth!.userId } },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedByUserId: req.auth!.userId },
    });
    if (changed.count !== 1) throw new AppError(409, 'RECOVERY_RUNBOOK_CONCURRENT_UPDATE', 'The runbook changed while approving. Refresh and try again.');
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'recovery.runbook_approved', targetType: 'recovery_runbook', targetId: runbookId, metadata: { rationale: input.rationale ?? null } } });
    return tx.recoveryRunbook.findFirstOrThrow({ where: { id: runbookId }, include: runbookInclude });
  });
  res.json({ data: updated });
});

recoveryRouter.get('/simulations', async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
  const data = await prisma.recoverySimulation.findMany({
    where: { organizationId: req.auth!.organizationId },
    include: { runbook: { select: { id: true, title: true, version: true, serviceId: true } }, steps: true, events: { orderBy: { createdAt: 'asc' }, take: 100 } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ data });
});

recoveryRouter.get('/simulations/:simulationId', async (req, res) => {
  const simulationId = z.string().uuid().parse(req.params.simulationId);
  const data = await prisma.recoverySimulation.findFirst({
    where: { id: simulationId, organizationId: req.auth!.organizationId },
    include: { runbook: { select: { id: true, title: true, version: true, serviceId: true, rtoMinutes: true, rpoMinutes: true } }, steps: { include: { runbookStep: { select: { sequence: true, title: true, description: true, validationCriteria: true } } }, orderBy: { createdAt: 'asc' } }, events: { orderBy: { createdAt: 'asc' }, take: 200 } },
  });
  if (!data) throw new AppError(404, 'RECOVERY_SIMULATION_NOT_FOUND', 'The simulation was not found.');
  res.json({ data });
});

recoveryRouter.post('/simulations', requirePermission('continuity:write'), async (req, res) => {
  const input = z.object({ runbookId: z.string().uuid(), incidentId: z.string().uuid().optional() }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const runbook = await prisma.recoveryRunbook.findFirst({
    where: { id: input.runbookId, organizationId, status: 'APPROVED' },
    include: { steps: { orderBy: { sequence: 'asc' }, include: { predecessors: { select: { predecessorStepId: true } } } } },
  });
  if (!runbook) throw new AppError(404, 'RECOVERY_RUNBOOK_NOT_APPROVED', 'An approved recovery runbook was not found in this workspace.');
  if (input.incidentId) {
    const incident = await prisma.incident.findFirst({ where: { id: input.incidentId, organizationId }, select: { id: true } });
    if (!incident) throw new AppError(404, 'RECOVERY_INCIDENT_NOT_FOUND', 'The incident was not found in this workspace.');
  }
  const serviceDependencySnapshot = await prisma.dependency.findMany({
    where: {
      organizationId,
      OR: [
        { sourceType: 'BUSINESS_SERVICE', sourceId: runbook.serviceId },
        { targetType: 'BUSINESS_SERVICE', targetId: runbook.serviceId },
      ],
    },
    select: { sourceType: true, sourceId: true, targetType: true, targetId: true, type: true, status: true, criticality: true, confidence: true, verifiedAt: true },
    orderBy: [{ sourceId: 'asc' }, { targetId: 'asc' }],
    take: 250,
  });
  const dependencySnapshot = serviceDependencySnapshot.map(item => ({ ...item, verifiedAt: item.verifiedAt?.toISOString() ?? null }));
  const simulation = await prisma.$transaction(async tx => {
    const created = await tx.recoverySimulation.create({
      data: {
        organizationId,
        runbookId: runbook.id,
        incidentId: input.incidentId,
        runbookVersion: runbook.version,
        targetRtoMinutes: runbook.rtoMinutes,
        targetRpoMinutes: runbook.rpoMinutes,
        dependencySnapshot: { capturedAt: new Date().toISOString(), serviceDependencies: dependencySnapshot, runbookStepDependencies: runbook.steps.map(step => ({ stepId: step.id, predecessors: step.predecessors.map(item => item.predecessorStepId) })) },
        steps: { create: runbook.steps.map(step => ({ runbookStepId: step.id })) },
      },
    });
    await tx.recoveryEvent.create({ data: { simulationId: created.id, actorUserId: req.auth!.userId, eventType: 'SIMULATION_CREATED', message: 'A simulation was created from an approved runbook. No infrastructure actions were executed.', metadata: { runbookId: runbook.id, runbookVersion: runbook.version } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'recovery.simulation_created', targetType: 'recovery_simulation', targetId: created.id } });
    return tx.recoverySimulation.findFirstOrThrow({ where: { id: created.id }, include: { steps: true, events: { orderBy: { createdAt: 'asc' } } } });
  });
  res.status(201).json({ data: simulation });
});

recoveryRouter.post('/simulations/:simulationId/start', requirePermission('continuity:write'), async (req, res) => {
  const simulationId = z.string().uuid().parse(req.params.simulationId);
  const input = z.object({ prerequisitesAcknowledged: z.literal(true) }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.recoverySimulation.findFirst({ where: { id: simulationId, organizationId }, include: { runbook: { select: { status: true } }, steps: true } });
  if (!current) throw new AppError(404, 'RECOVERY_SIMULATION_NOT_FOUND', 'The simulation was not found.');
  if (current.status !== 'PLANNED' || !isSimulationReady({ runbookStatus: current.runbook.status, mandatoryPrerequisitesAcknowledged: input.prerequisitesAcknowledged, hasSteps: current.steps.length > 0 })) {
    throw new AppError(409, 'RECOVERY_SIMULATION_NOT_READY', 'The simulation requires an approved runbook, at least one step and explicit prerequisite acknowledgement.');
  }
  const now = new Date();
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.recoverySimulation.updateMany({ where: { id: simulationId, organizationId, status: 'PLANNED' }, data: { status: 'READY' } });
    if (changed.count !== 1) throw new AppError(409, 'RECOVERY_SIMULATION_CONCURRENT_UPDATE', 'The simulation changed while starting. Refresh and try again.');
    await tx.recoverySimulation.update({ where: { id: simulationId }, data: { status: 'RUNNING', startedAt: now } });
    await tx.recoverySimulationStep.updateMany({ where: { simulationId, runbookStep: { predecessors: { none: {} } } }, data: { status: 'READY' } });
    await tx.recoveryEvent.create({ data: { simulationId, actorUserId: req.auth!.userId, eventType: 'SIMULATION_STARTED', message: 'Simulation started. All actions are rehearsal records only.', metadata: { mandatoryPrerequisitesAcknowledged: input.prerequisitesAcknowledged } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'recovery.simulation_started', targetType: 'recovery_simulation', targetId: simulationId } });
    return tx.recoverySimulation.findFirstOrThrow({ where: { id: simulationId }, include: { steps: true, events: { orderBy: { createdAt: 'asc' } } } });
  });
  res.json({ data: updated });
});

recoveryRouter.patch('/simulations/:simulationId/steps/:stepId', requirePermission('continuity:write'), async (req, res) => {
  const simulationId = z.string().uuid().parse(req.params.simulationId);
  const stepId = z.string().uuid().parse(req.params.stepId);
  const input = z.object({
    status: z.enum(['IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'SKIPPED']),
    operatorName: z.string().trim().min(2).max(120),
    outcome: z.string().trim().min(5).max(5000).optional(),
    rationale: z.string().trim().min(5).max(2000).optional(),
    evidenceReference: z.string().trim().max(500).optional(),
    waiverRationale: z.string().trim().min(5).max(2000).optional(),
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.recoverySimulationStep.findFirst({
    where: { id: stepId, simulationId, simulation: { organizationId, status: 'RUNNING' } },
    include: { runbookStep: { select: { id: true } } },
  });
  if (!current) throw new AppError(404, 'RECOVERY_SIMULATION_STEP_NOT_FOUND', 'The active simulation step was not found.');
  if (!canTransitionRecoveryStep(current.status, input.status)) throw new AppError(409, 'RECOVERY_STEP_INVALID_TRANSITION', `Cannot move a recovery step from ${current.status} to ${input.status}.`);
  if (input.status !== 'IN_PROGRESS' && !input.outcome) throw new AppError(422, 'RECOVERY_STEP_OUTCOME_REQUIRED', 'A step outcome summary is required when recording a result.');
  if (['FAILED', 'BLOCKED'].includes(input.status) && !input.rationale) throw new AppError(422, 'RECOVERY_STEP_RATIONALE_REQUIRED', 'Failed or blocked steps require a rationale.');
  if (input.status === 'SKIPPED' && !input.waiverRationale) throw new AppError(422, 'RECOVERY_STEP_WAIVER_REQUIRED', 'A skipped prerequisite requires an explicit waiver rationale.');
  if (input.status === 'IN_PROGRESS') {
    const dependencies = await prisma.recoveryStepDependency.findMany({ where: { successorStepId: current.runbookStep.id } });
    const predecessorIds = dependencies.map(item => item.predecessorStepId);
    const predecessors = predecessorIds.length ? await prisma.recoverySimulationStep.findMany({
      where: { simulationId, runbookStepId: { in: predecessorIds } },
      select: { runbookStepId: true, status: true, waiverRationale: true },
    }) : [];
    if (!canStartRecoveryStep(predecessorIds.map(id => {
      const found = predecessors.find(item => item.runbookStepId === id);
      return { predecessorId: id, status: found?.status ?? 'PENDING', waiverRationale: found?.waiverRationale };
    }))) throw new AppError(409, 'RECOVERY_STEP_PREREQUISITES_INCOMPLETE', 'All prerequisite steps must succeed or have an explicitly justified waiver before this step starts.');
  }
  const now = new Date();
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.recoverySimulationStep.updateMany({
      where: { id: stepId, simulationId, status: current.status },
      data: {
        status: input.status,
        operatorName: input.operatorName,
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(input.rationale ? { rationale: input.rationale } : {}),
        ...(input.evidenceReference ? { evidenceReference: input.evidenceReference } : {}),
        ...(input.waiverRationale ? { waiverRationale: input.waiverRationale } : {}),
        ...(input.status === 'IN_PROGRESS' ? { startedAt: now } : {}),
        ...(['SUCCEEDED', 'FAILED', 'BLOCKED', 'SKIPPED'].includes(input.status) ? { completedAt: now } : {}),
      },
    });
    if (changed.count !== 1) throw new AppError(409, 'RECOVERY_STEP_CONCURRENT_UPDATE', 'The step changed while updating. Refresh and try again.');
    await tx.recoveryEvent.create({ data: { simulationId, actorUserId: req.auth!.userId, eventType: 'STEP_UPDATED', message: `Step outcome recorded: ${input.status}.`, metadata: { stepId, status: input.status } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'recovery.simulation_step_updated', targetType: 'recovery_simulation_step', targetId: stepId, metadata: { simulationId, status: input.status } } });
    return tx.recoverySimulationStep.findFirstOrThrow({ where: { id: stepId } });
  });
  res.json({ data: updated });
});

recoveryRouter.post('/simulations/:simulationId/complete', requirePermission('continuity:write'), async (req, res) => {
  const simulationId = z.string().uuid().parse(req.params.simulationId);
  const input = z.object({
    summary: z.string().trim().min(10).max(10000),
    simulatedElapsedMinutes: z.number().int().min(0).max(525600),
    dataLossAssumptionMinutes: z.number().int().min(0).max(525600),
  }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.recoverySimulation.findFirst({ where: { id: simulationId, organizationId }, include: { steps: { select: { status: true } } } });
  if (!current) throw new AppError(404, 'RECOVERY_SIMULATION_NOT_FOUND', 'The simulation was not found.');
  if (current.status !== 'RUNNING' || current.steps.some(step => ['PENDING', 'READY', 'IN_PROGRESS'].includes(step.status))) {
    throw new AppError(409, 'RECOVERY_SIMULATION_INCOMPLETE', 'Every simulation step must have a recorded outcome before completion.');
  }
  const hasBlockingOutcome = current.steps.some(step => ['FAILED', 'BLOCKED'].includes(step.status));
  const terminalStatus = hasBlockingOutcome ? 'BLOCKED' : 'COMPLETED';
  const rtoAssessment = compareRecoveryTarget(current.targetRtoMinutes, input.simulatedElapsedMinutes);
  const rpoAssessment = compareRecoveryTarget(current.targetRpoMinutes, input.dataLossAssumptionMinutes);
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.recoverySimulation.updateMany({
      where: { id: simulationId, organizationId, status: 'RUNNING' },
      data: { status: terminalStatus, completedAt: new Date(), summary: input.summary, simulatedElapsedMinutes: input.simulatedElapsedMinutes, dataLossAssumptionMinutes: input.dataLossAssumptionMinutes },
    });
    if (changed.count !== 1) throw new AppError(409, 'RECOVERY_SIMULATION_CONCURRENT_UPDATE', 'The simulation changed while completing. Refresh and try again.');
    await tx.recoveryEvent.create({ data: { simulationId, actorUserId: req.auth!.userId, eventType: hasBlockingOutcome ? 'SIMULATION_BLOCKED' : 'SIMULATION_COMPLETED', message: hasBlockingOutcome ? 'Simulation closed with failed or blocked steps. Results represent rehearsal observations only.' : 'Simulation completed. Results represent rehearsal observations, not proof of real recovery capability.', metadata: { simulatedElapsedMinutes: input.simulatedElapsedMinutes, dataLossAssumptionMinutes: input.dataLossAssumptionMinutes, targetRtoMinutes: current.targetRtoMinutes, targetRpoMinutes: current.targetRpoMinutes, rtoAssessment, rpoAssessment } } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: hasBlockingOutcome ? 'recovery.simulation_blocked' : 'recovery.simulation_completed', targetType: 'recovery_simulation', targetId: simulationId } });
    return tx.recoverySimulation.findFirstOrThrow({ where: { id: simulationId }, include: { steps: true, events: { orderBy: { createdAt: 'asc' } } } });
  });
  res.json({ data: updated });
});

recoveryRouter.post('/simulations/:simulationId/cancel', requirePermission('continuity:write'), async (req, res) => {
  const simulationId = z.string().uuid().parse(req.params.simulationId);
  const input = z.object({ rationale: z.string().trim().min(5).max(2000) }).parse(req.body);
  const organizationId = req.auth!.organizationId;
  const current = await prisma.recoverySimulation.findFirst({ where: { id: simulationId, organizationId }, select: { status: true } });
  if (!current) throw new AppError(404, 'RECOVERY_SIMULATION_NOT_FOUND', 'The simulation was not found.');
  if (!['PLANNED', 'READY', 'RUNNING'].includes(current.status)) throw new AppError(409, 'RECOVERY_SIMULATION_NOT_CANCELLABLE', 'This simulation is already terminal.');
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.recoverySimulation.updateMany({ where: { id: simulationId, organizationId, status: current.status }, data: { status: 'CANCELLED', completedAt: new Date(), summary: input.rationale } });
    if (changed.count !== 1) throw new AppError(409, 'RECOVERY_SIMULATION_CONCURRENT_UPDATE', 'The simulation changed while cancelling. Refresh and try again.');
    await tx.recoveryEvent.create({ data: { simulationId, actorUserId: req.auth!.userId, eventType: 'SIMULATION_CANCELLED', message: input.rationale } });
    await tx.auditEvent.create({ data: { organizationId, actorUserId: req.auth!.userId, action: 'recovery.simulation_cancelled', targetType: 'recovery_simulation', targetId: simulationId } });
    return tx.recoverySimulation.findFirstOrThrow({ where: { id: simulationId }, include: { steps: true, events: { orderBy: { createdAt: 'asc' } } } });
  });
  res.json({ data: updated });
});
