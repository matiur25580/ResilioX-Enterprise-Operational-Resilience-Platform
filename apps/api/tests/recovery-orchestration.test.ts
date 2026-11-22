import { describe, expect, it } from 'vitest';
import {
  canApproveRunbook,
  canStartRecoveryStep,
  canTransitionRunbook,
  canTransitionSimulation,
  compareRecoveryTarget,
  hasDependencyCycle,
  isSimulationReady,
} from '../src/lib/recovery-orchestration.js';

describe('recovery runbook lifecycle', () => {
  it('allows only documented transitions', () => {
    expect(canTransitionRunbook('DRAFT', 'IN_REVIEW')).toBe(true);
    expect(canTransitionRunbook('IN_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionRunbook('APPROVED', 'DRAFT')).toBe(false);
    expect(canTransitionRunbook('RETIRED', 'APPROVED')).toBe(false);
  });

  it('enforces maker-checker approval', () => {
    expect(canApproveRunbook('author-1', 'reviewer-2')).toBe(true);
    expect(canApproveRunbook('author-1', 'author-1')).toBe(false);
    expect(canApproveRunbook('', 'reviewer-2')).toBe(false);
  });
});

describe('recovery simulation policies', () => {
  it('permits only valid simulation transitions', () => {
    expect(canTransitionSimulation('PLANNED', 'READY')).toBe(true);
    expect(canTransitionSimulation('READY', 'RUNNING')).toBe(true);
    expect(canTransitionSimulation('RUNNING', 'COMPLETED')).toBe(true);
    expect(canTransitionSimulation('COMPLETED', 'RUNNING')).toBe(false);
  });

  it('requires an approved runbook, acknowledged prerequisites and steps', () => {
    expect(isSimulationReady({ runbookStatus: 'APPROVED', mandatoryPrerequisitesAcknowledged: true, hasSteps: true })).toBe(true);
    expect(isSimulationReady({ runbookStatus: 'DRAFT', mandatoryPrerequisitesAcknowledged: true, hasSteps: true })).toBe(false);
    expect(isSimulationReady({ runbookStatus: 'APPROVED', mandatoryPrerequisitesAcknowledged: false, hasSteps: true })).toBe(false);
    expect(isSimulationReady({ runbookStatus: 'APPROVED', mandatoryPrerequisitesAcknowledged: true, hasSteps: false })).toBe(false);
  });

  it('requires every predecessor to succeed or have an explicit waiver rationale', () => {
    expect(canStartRecoveryStep([{ predecessorId: 'a', status: 'SUCCEEDED' }])).toBe(true);
    expect(canStartRecoveryStep([{ predecessorId: 'a', status: 'SKIPPED', waiverRationale: 'Not applicable in this exercise.' }])).toBe(true);
    expect(canStartRecoveryStep([{ predecessorId: 'a', status: 'SKIPPED', waiverRationale: ' ' }])).toBe(false);
    expect(canStartRecoveryStep([{ predecessorId: 'a', status: 'FAILED' }])).toBe(false);
    expect(canStartRecoveryStep([{ predecessorId: 'a', status: 'IN_PROGRESS' }])).toBe(false);
  });

  it('rejects dependency cycles, self edges and references to unknown steps', () => {
    expect(hasDependencyCycle(['a', 'b', 'c'], [{ predecessorId: 'a', successorId: 'b' }, { predecessorId: 'b', successorId: 'c' }])).toBe(false);
    expect(hasDependencyCycle(['a', 'b'], [{ predecessorId: 'a', successorId: 'b' }, { predecessorId: 'b', successorId: 'a' }])).toBe(true);
    expect(hasDependencyCycle(['a'], [{ predecessorId: 'a', successorId: 'a' }])).toBe(true);
    expect(hasDependencyCycle(['a'], [{ predecessorId: 'a', successorId: 'missing' }])).toBe(true);
  });

  it('compares observed recovery duration without treating unknown targets as zero', () => {
    expect(compareRecoveryTarget(120, 90)).toBe('WITHIN_TARGET');
    expect(compareRecoveryTarget(120, 120)).toBe('WITHIN_TARGET');
    expect(compareRecoveryTarget(120, 121)).toBe('BREACHED');
    expect(compareRecoveryTarget(null, 20)).toBe('UNKNOWN');
    expect(compareRecoveryTarget(20, null)).toBe('UNKNOWN');
    expect(() => compareRecoveryTarget(-1, 0)).toThrow();
  });
});
