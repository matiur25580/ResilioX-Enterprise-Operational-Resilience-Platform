import { describe, expect, it } from 'vitest';
import { canTransitionIncident } from '../src/lib/incident-lifecycle.js';

describe('incident lifecycle policy', () => {
  it('allows only the documented forward and recovery transitions', () => {
    expect(canTransitionIncident('DETECTED', 'TRIAGED')).toBe(true);
    expect(canTransitionIncident('TRIAGED', 'ACTIVE')).toBe(true);
    expect(canTransitionIncident('ACTIVE', 'MITIGATING')).toBe(true);
    expect(canTransitionIncident('MITIGATING', 'ACTIVE')).toBe(true);
    expect(canTransitionIncident('RESOLVED', 'ACTIVE')).toBe(true);
    expect(canTransitionIncident('RESOLVED', 'CLOSED')).toBe(true);
  });

  it('rejects skipped, backward and terminal-state transitions', () => {
    expect(canTransitionIncident('DETECTED', 'RESOLVED')).toBe(false);
    expect(canTransitionIncident('ACTIVE', 'CLOSED')).toBe(false);
    expect(canTransitionIncident('CLOSED', 'ACTIVE')).toBe(false);
    expect(canTransitionIncident('CANCELLED', 'TRIAGED')).toBe(false);
    expect(canTransitionIncident('UNKNOWN', 'ACTIVE')).toBe(false);
  });
});
