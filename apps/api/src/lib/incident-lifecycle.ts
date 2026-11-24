export const incidentTransitions = {
  DETECTED: ['TRIAGED', 'CANCELLED'],
  TRIAGED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['MITIGATING', 'RESOLVED'],
  MITIGATING: ['ACTIVE', 'RESOLVED'],
  RESOLVED: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
  CANCELLED: [],
} as const;

export type IncidentLifecycleStatus = keyof typeof incidentTransitions;

// Enforce the declared incident state graph so callers cannot skip required response stages.
export function canTransitionIncident(from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(incidentTransitions, from)
    && (incidentTransitions[from as IncidentLifecycleStatus] as readonly string[]).includes(to);
}
