export type GraphEdge = { id: string; sourceType: string; sourceId: string; targetType: string; targetId: string; type: string; status: string; criticality: string; confidence: number };
export type GraphNode = { type: string; id: string };
const key = (type: string, id: string) => type + ':' + id;

export function hasDirectedPath(edges: GraphEdge[], start: GraphNode, target: GraphNode): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.status === 'RETIRED') continue;
    const from = key(edge.sourceType, edge.sourceId);
    const to = key(edge.targetType, edge.targetId);
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  }
  const goal = key(target.type, target.id);
  const queue = [key(start.type, start.id)];
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift()!;
    if (current === goal) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  return false;
}

export function traverseVerifiedGraph(edges: GraphEdge[], root: GraphNode, maxNodes = 200) {
  const verified = edges.filter(edge => edge.status === 'VERIFIED');
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of verified) {
    const from = key(edge.sourceType, edge.sourceId);
    adjacency.set(from, [...(adjacency.get(from) ?? []), edge]);
  }
  const rootKey = key(root.type, root.id);
  const queue = [rootKey];
  const visited = new Set([rootKey]);
  const selectedEdges: GraphEdge[] = [];
  let truncated = false;
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) ?? []) {
      const next = key(edge.targetType, edge.targetId);
      if (!visited.has(next)) {
        if (visited.size >= maxNodes) { truncated = true; continue; }
        visited.add(next);
        queue.push(next);
      }
      selectedEdges.push(edge);
    }
  }
  const nodes = [...visited].map(value => {
    const split = value.indexOf(':');
    return { type: value.slice(0, split), id: value.slice(split + 1) };
  });
  return { root, nodes, edges: selectedEdges, truncated };
}
