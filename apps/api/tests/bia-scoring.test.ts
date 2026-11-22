import { describe, expect, it } from 'vitest';
import { calculateImpactScore, classifyCriticality } from '../src/lib/bia-scoring.js';

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
