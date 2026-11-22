import { describe, expect, it } from 'vitest';
import { calculateScenarioImpact } from './scenario-simulation.js';
import type { GraphEdge } from './dependency-graph.js';

const edge = (sourceType: string, sourceId: string, targetType: string, targetId: string, status = 'VERIFIED'): GraphEdge => ({
  id: sourceId + '-' + targetId, sourceType, sourceId, targetType, targetId,
  type: 'DEPENDS_ON', status, criticality: 'HIGH', confidence: 90,
});

describe('scenario impact engine', () => {
  const nodes = [
    { type: 'SUPPLIER', id: 'supplier', name: 'Cloud provider', criticality: 'HIGH' },
    { type: 'APPLICATION', id: 'app', name: 'Payments app' },
    { type: 'BUSINESS_SERVICE', id: 'critical', name: 'Payments', criticality: 'CRITICAL' },
    { type: 'BUSINESS_SERVICE', id: 'low', name: 'Reporting', criticality: 'LOW' },
  ];
  const edges = [
    edge('BUSINESS_SERVICE', 'critical', 'APPLICATION', 'app'),
    edge('APPLICATION', 'app', 'SUPPLIER', 'supplier'),
    edge('BUSINESS_SERVICE', 'low', 'APPLICATION', 'app'),
    edge('BUSINESS_SERVICE', 'low', 'SUPPLIER', 'supplier', 'PROPOSED'),
  ];

  it('propagates verified edges only and ranks critical services first', () => {
    const result = calculateScenarioImpact({
      root: nodes[0], nodes, edges, durationHours: 24, severity: 'UNAVAILABLE',
      approvedRtoByService: { critical: 60 },
    });
    expect(result.affectedNodes.map(node => node.id)).toEqual(['supplier', 'app', 'critical', 'low']);
    expect(result.affectedServices[0]?.id).toBe('critical');
    expect(result.affectedServices[0]?.rtoMinutes).toBe(60);
    expect(result.summary.affectedServiceCount).toBe(2);
  });

  it('is deterministic for identical inputs', () => {
    const input = { root: nodes[0], nodes, edges, durationHours: 8, severity: 'DEGRADED' as const };
    expect(calculateScenarioImpact(input)).toEqual(calculateScenarioImpact(input));
  });

  it('rejects invalid duration values', () => {
    expect(() => calculateScenarioImpact({ root: nodes[0], nodes, edges, durationHours: 0, severity: 'UNAVAILABLE' })).toThrow(/duration/);
  });

  it('does not traverse proposed or retired relationships', () => {
    const result = calculateScenarioImpact({
      root: nodes[0], nodes, edges: [edge('BUSINESS_SERVICE', 'low', 'SUPPLIER', 'supplier', 'RETIRED')],
      durationHours: 4, severity: 'UNAVAILABLE',
    });
    expect(result.affectedNodes).toHaveLength(1);
    expect(result.affectedServices).toHaveLength(0);
  });
});
