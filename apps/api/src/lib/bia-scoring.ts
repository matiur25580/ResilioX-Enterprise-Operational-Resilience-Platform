export const impactHorizons = ['IMMEDIATE', 'FOUR_HOURS', 'TWENTY_FOUR_HOURS', 'SEVENTY_TWO_HOURS', 'ONE_WEEK'] as const;
export type ImpactScores = { financial: number; operational: number; regulatory: number; reputational: number };

/** Uses the highest combined four-dimension impact at any horizon (1–5 per dimension). */
export function calculateImpactScore(snapshots: ImpactScores[]): number {
  if (snapshots.length === 0) throw new Error('At least one impact horizon is required.');
  return Math.max(...snapshots.map(item => item.financial + item.operational + item.regulatory + item.reputational));
}

/** Transparent fixed bands: 16–20 critical, 12–15 high, 8–11 medium, 4–7 low. */
export function classifyCriticality(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!Number.isInteger(score) || score < 4 || score > 20) throw new Error('Impact score must be an integer from 4 to 20.');
  if (score >= 16) return 'CRITICAL';
  if (score >= 12) return 'HIGH';
  if (score >= 8) return 'MEDIUM';
  return 'LOW';
}
