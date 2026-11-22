import { describe, expect, it } from 'vitest';
import { calculateInherentRisk, calculateResidualRisk, classifyRisk } from '../src/lib/risk-scoring.js';

describe('risk scoring', () => {
  it('calculates transparent likelihood multiplied by impact', () => {
    expect(calculateInherentRisk(5, 4)).toBe(20);
    expect(calculateInherentRisk(1, 1)).toBe(1);
  });
  it('rejects scores outside the documented 1–5 scales', () => {
    expect(() => calculateInherentRisk(0, 3)).toThrow();
    expect(() => calculateInherentRisk(3, 6)).toThrow();
  });
  it('does not reduce residual risk without controls', () => {
    expect(calculateResidualRisk(20, [])).toBe(20);
  });
  it('uses average tested control effectiveness and rounds conservatively upward', () => {
    expect(calculateResidualRisk(20, [50])).toBe(10);
    expect(calculateResidualRisk(21, [50, 50])).toBe(11);
    expect(calculateResidualRisk(20, [50, 100])).toBe(5);
  });
  it('rejects invalid effectiveness values', () => {
    expect(() => calculateResidualRisk(20, [101])).toThrow();
  });
  it('classifies residual scores using documented bands', () => {
    expect(classifyRisk(4)).toBe('LOW');
    expect(classifyRisk(5)).toBe('MODERATE');
    expect(classifyRisk(10)).toBe('HIGH');
    expect(classifyRisk(17)).toBe('CRITICAL');
  });
});
