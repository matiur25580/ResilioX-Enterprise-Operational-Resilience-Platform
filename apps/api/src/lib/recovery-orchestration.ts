export const recoveryRunbookTransitions = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['DRAFT', 'APPROVED'],
  APPROVED: ['RETIRED'],
  RETIRED: [],
} as const;

export const recoverySimulationTransitions = {
  PLANNED: ['READY', 'CANCELLED'],
  READY: ['RUNNING', 'BLOCKED', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'BLOCKED', 'CANCELLED'],
  COMPLETED: [],
  BLOCKED: [],
  CANCELLED: [],
} as const;

export const recoveryStepTransitions = {
  PENDING: ['READY', 'IN_PROGRESS', 'BLOCKED', 'SKIPPED'],
  READY: ['IN_PROGRESS', 'BLOCKED', 'SKIPPED'],
  IN_PROGRESS: ['SUCCEEDED', 'FAILED', 'BLOCKED'],
  SUCCEEDED: [],
  FAILED: [],
  BLOCKED: [],
  SKIPPED: [],
} as const;

export type RecoveryRunbookStatus = keyof typeof recoveryRunbookTransitions;
export type RecoverySimulationStatus = keyof typeof recoverySimulationTransitions;
export type RecoveryStepState = keyof typeof recoveryStepTransitions;

export function canTransitionRunbook(from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(recoveryRunbookTransitions, from)
    && (recoveryRunbookTransitions[from as RecoveryRunbookStatus] as readonly string[]).includes(to);
}

export function canTransitionSimulation(from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(recoverySimulationTransitions, from)
    && (recoverySimulationTransitions[from as RecoverySimulationStatus] as readonly string[]).includes(to);
}

export function canTransitionRecoveryStep(from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(recoveryStepTransitions, from)
    && (recoveryStepTransitions[from as RecoveryStepState] as readonly string[]).includes(to);
}

export function canApproveRunbook(authorUserId: string, reviewerUserId: string): boolean {
  return Boolean(authorUserId && reviewerUserId && authorUserId !== reviewerUserId);
}

export interface StepDependency {
  predecessorId: string;
  successorId: string;
}

/** Returns true when the supplied edges contain a cycle or invalid step reference. */
export function hasDependencyCycle(stepIds: string[], edges: StepDependency[]): boolean {
  const known = new Set(stepIds);
  const adjacency = new Map<string, string[]>();
  for (const id of stepIds) adjacency.set(id, []);
  for (const edge of edges) {
    if (!known.has(edge.predecessorId) || !known.has(edge.successorId)) return true;
    if (edge.predecessorId === edge.successorId) return true;
    adjacency.get(edge.predecessorId)!.push(edge.successorId);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of stepIds) if (visit(id)) return true;
  return false;
}

export interface PrerequisiteState {
  predecessorId: string;
  status: RecoveryStepState;
  waiverRationale?: string | null;
}

export function canStartRecoveryStep(prerequisites: PrerequisiteState[]): boolean {
  return prerequisites.every(item =>
    item.status === 'SUCCEEDED' || (item.status === 'SKIPPED' && Boolean(item.waiverRationale?.trim())),
  );
}

export function isSimulationReady(input: {
  runbookStatus: string;
  mandatoryPrerequisitesAcknowledged: boolean;
  hasSteps: boolean;
}): boolean {
  return input.runbookStatus === 'APPROVED'
    && input.mandatoryPrerequisitesAcknowledged
    && input.hasSteps;
}

/** Null means the target or observed rehearsal value is unknown, not zero. */
export function compareRecoveryTarget(targetMinutes: number | null, observedMinutes: number | null): 'WITHIN_TARGET' | 'BREACHED' | 'UNKNOWN' {
  if (targetMinutes === null || observedMinutes === null) return 'UNKNOWN';
  if (!Number.isInteger(targetMinutes) || !Number.isInteger(observedMinutes) || targetMinutes < 0 || observedMinutes < 0) {
    throw new Error('Recovery target and observed duration must be non-negative integer minutes.');
  }
  return observedMinutes <= targetMinutes ? 'WITHIN_TARGET' : 'BREACHED';
}
