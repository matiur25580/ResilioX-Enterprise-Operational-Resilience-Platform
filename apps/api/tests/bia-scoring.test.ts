import { describe, expect, it } from 'vitest';
import { calculateImpactScore, classifyCriticality } from '../src/lib/bia-scoring.js';
import { assessmentSchema } from '../src/routes/bia.routes.js';

describe('business impact scoring', () => {
  it('uses the highest combined impact across all horizons', () => {
    expect(calculateImpactScore([{ financial: 1, operational: 2, regulatory: 1, reputational: 1 }, { financial: 4, operational: 5, regulatory: 3, reputational: 4 }])).toBe(16);
  });
  it.each([[16, 'CRITICAL'], [12, 'HIGH'], [8, 'MEDIUM'], [4, 'LOW']] as const)('classifies score %i', (score, tier) => {
    expect(classifyCriticality(score)).toBe(tier);
  });
  it('rejects scores outside the documented scale', () => {
    expect(() => classifyCriticality(21)).toThrow();
    expect(() => calculateImpactScore([])).toThrow();
  });
});



describe('business impact assessment validation', () => {
  const base = {
    processId: '11111111-1111-4111-8111-111111111111',
    ownerName: 'Payments Operations',
    mtpdMinutes: 1440,
    rtoMinutes: 240,
    rpoMinutes: 0,
    rationale: 'Validated against the service recovery policy.',
    impacts: [
      { horizon: 'IMMEDIATE', financial: 1, operational: 1, regulatory: 1, reputational: 1 },
      { horizon: 'FOUR_HOURS', financial: 2, operational: 2, regulatory: 2, reputational: 2 },
      { horizon: 'TWENTY_FOUR_HOURS', financial: 3, operational: 3, regulatory: 3, reputational: 3 },
      { horizon: 'SEVENTY_TWO_HOURS', financial: 4, operational: 4, regulatory: 4, reputational: 4 },
      { horizon: 'ONE_WEEK', financial: 5, operational: 5, regulatory: 5, reputational: 5 },
    ],
  };
  it('accepts a complete assessment with RTO within MTPD and zero RPO', () => {
    expect(assessmentSchema.safeParse(base).success).toBe(true);
  });
  it('rejects an RTO greater than MTPD', () => {
    expect(assessmentSchema.safeParse({ ...base, rtoMinutes: 1441 }).success).toBe(false);
  });
  it('rejects duplicate or missing impact horizons', () => {
    const impacts = [...base.impacts.slice(0, 4), { ...base.impacts[0], horizon: 'ONE_WEEK' as const }];
    expect(assessmentSchema.safeParse({ ...base, impacts }).success).toBe(false);
  });
  it('rejects scores outside the 1–5 impact scale', () => {
    const impacts = base.impacts.map((item, index) => index === 0 ? { ...item, regulatory: 6 } : item);
    expect(assessmentSchema.safeParse({ ...base, impacts }).success).toBe(false);
  });
});
