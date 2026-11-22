import type { GraphEdge, GraphNode } from './dependency-graph.js';

export const SCENARIO_MODEL_VERSION = '1.0.0';
export type ScenarioSeverity = 'DEGRADED' | 'UNAVAILABLE';
export type ScenarioNode = GraphNode & { name: string; criticality?: string };

const criticalityWeight: Record<string, number> = { CRITICAL: 40, HIGH: 30, MEDIUM: 20, LOW: 10 };

export function calculateScenarioImpact(input: {
  root: ScenarioNode; nodes: ScenarioNode[]; edges: GraphEdge[];
  durationHours: number; severity: ScenarioSeverity; approvedRtoByService?: Record<string, number>;
}) {
  if (!Number.isInteger(input.durationHours) || input.durationHours < 1 || input.durationHours > 720) {
    throw new Error('Scenario duration must be between 1 and 720 whole hours.');
  }
  const nodeKey = (node: GraphNode) => node.type + ':' + node.id;
  const byKey = new Map(input.nodes.map(node => [nodeKey(node), node] as const));
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of input.edges) {
    if (edge.status !== 'VERIFIED') continue;
    const key = nodeKey({ type: edge.sourceType, id: edge.sourceId });
    adjacency.set(key, [...(adjacency.get(key) ?? []), edge]);
  }
  const rootKey = nodeKey(input.root);
  const queue: Array<{ key: string; depth: number; path: string[] }> = [{ key: rootKey, depth: 0, path: [input.root.name] }];
  const visited = new Set([rootKey]);
  const affected: Array<{ node: ScenarioNode; depth: number; path: string[] }> = [];
  while (queue.length && visited.size <= 500) {
    const current = queue.shift()!;
    const node = byKey.get(current.key);
    if (node) affected.push({ node, depth: current.depth, path: current.path });
    for (const edge of adjacency.get(current.key) ?? []) {
      const nextKey = nodeKey({ type: edge.targetType, id: edge.targetId });
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      const next = byKey.get(nextKey);
      queue.push({ key: nextKey, depth: current.depth + 1, path: next ? [...current.path, next.name] : current.path });
    }
  }
  const severityFactor = input.severity === 'UNAVAILABLE' ? 1 : 0.72;
  const durationFactor = Math.min(1, 0.45 + input.durationHours / 48);
  const services = affected.filter(item => item.node.type === 'BUSINESS_SERVICE').map(({ node, depth, path }) => {
    const base = criticalityWeight[node.criticality ?? 'MEDIUM'] ?? 20;
    const priorityScore = Math.min(100, Math.round((base + Math.max(0, 12 - depth * 2)) * severityFactor * durationFactor));
    return { id: node.id, name: node.name, criticality: node.criticality ?? 'MEDIUM', depth, path, rtoMinutes: input.approvedRtoByService?.[node.id] ?? null, priorityScore };
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));
  return {
    modelVersion: SCENARIO_MODEL_VERSION,
    input: { root: input.root, severity: input.severity, durationHours: input.durationHours },
    assumptions: [
      'Only VERIFIED dependency edges are traversed; proposed, disputed and retired relationships are excluded.',
      'Impact propagates along the recorded source-to-target direction; the graph is not live infrastructure telemetry.',
      'Criticality and disruption duration are heuristic prioritization inputs, not probabilistic outage forecasts.',
      'RTO values are shown only from approved continuity plans and are not a prediction of actual recovery time.',
      'No infrastructure, failover, restore, paging or external control-plane action is executed.',
    ],
    affectedNodes: affected.map(({ node, depth, path }) => ({ type: node.type, id: node.id, name: node.name, depth, path })),
    affectedServices: services,
    graphSnapshot: {
      nodes: affected.map(({ node }) => ({ type: node.type, id: node.id, name: node.name })),
      edges: input.edges.filter(edge => edge.status === 'VERIFIED' && visited.has(nodeKey({ type: edge.sourceType, id: edge.sourceId })) && visited.has(nodeKey({ type: edge.targetType, id: edge.targetId }))),
    },
    summary: { affectedNodeCount: affected.length, affectedServiceCount: services.length, criticalServices: services.filter(service => service.criticality === 'CRITICAL').length, highPriorityServices: services.filter(service => service.priorityScore >= 30).length },
  };
}
