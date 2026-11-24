export type RiskBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export function calculateInherentRisk(likelihood: number, impact: number): number {
  if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5 || !Number.isInteger(impact) || impact < 1 || impact > 5) {
    throw new Error('Likelihood and impact must be integers from 1 to 5.');
  }
  return likelihood * impact;
}

// Reduce inherent risk using the average validated control-effectiveness percentage; no controls leave risk unchanged.
export function calculateResidualRisk(inherentScore: number, effectiveness: number[]): number {
  if (!Number.isInteger(inherentScore) || inherentScore < 1 || inherentScore > 25) throw new Error('Inherent risk score must be from 1 to 25.');
  if (effectiveness.some(value => !Number.isInteger(value) || value < 0 || value > 100)) throw new Error('Control effectiveness must be from 0 to 100.');
  if (!effectiveness.length) return inherentScore;
  const average = effectiveness.reduce((sum, value) => sum + value, 0) / effectiveness.length;
  return Math.ceil(inherentScore * (1 - average / 100));
}

export function classifyRisk(score: number): RiskBand {
  if (!Number.isInteger(score) || score < 0 || score > 25) throw new Error('Risk score must be an integer from 0 to 25.');
  if (score >= 17) return 'CRITICAL';
  if (score >= 10) return 'HIGH';
  if (score >= 5) return 'MODERATE';
  return 'LOW';
}
