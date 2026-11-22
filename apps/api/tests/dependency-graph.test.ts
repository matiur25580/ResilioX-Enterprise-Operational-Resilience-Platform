import { describe, expect, it } from 'vitest';
import { hasDirectedPath, traverseVerifiedGraph, type GraphEdge } from '../src/lib/dependency-graph.js';

const edge = (id: string, sourceId: string, targetId: string, status = 'VERIFIED'): GraphEdge => ({
  id, sourceType: 'APPLICATION', sourceId, targetType: 'TECHNOLOGY_ASSET', targetId,
  type: 'DEPENDS_ON', status, criticality: 'HIGH', confidence: 90,
});

describe('dependency graph traversal', () => {
  it('detects a directed path and prevents a cycle-forming reverse edge', () => {
    const edges = [edge('one', 'a', 'b'), { ...edge('two', 'b', 'c'), sourceType: 'TECHNOLOGY_ASSET', targetType: 'SUPPLIER' }];
    expect(hasDirectedPath(edges, { type: 'APPLICATION', id: 'a' }, { type: 'SUPPLIER', id: 'c' })).toBe(true);
    expect(hasDirectedPath(edges, { type: 'SUPPLIER', id: 'c' }, { type: 'APPLICATION', id: 'a' })).toBe(false);
  });

  it('ignores retired edges when checking for cycles', () => {
    expect(hasDirectedPath([edge('old', 'b', 'a', 'RETIRED')], { type: 'APPLICATION', id: 'b' }, { type: 'APPLICATION', id: 'a' })).toBe(false);
  });

  it('traverses only verified edges and returns stable breadth-first nodes', () => {
    const edges: GraphEdge[] = [
      edge('one', 'root', 'a'),
      { ...edge('two', 'root', 'b'), targetType: 'SUPPLIER' },
      edge('pending', 'root', 'not-verified', 'PROPOSED'),
      { ...edge('three', 'a', 'c'), sourceType: 'TECHNOLOGY_ASSET', targetType: 'SUPPLIER' },
    ];
    const result = traverseVerifiedGraph(edges, { type: 'APPLICATION', id: 'root' });
    expect(result.nodes).toEqual([
      { type: 'APPLICATION', id: 'root' },
      { type: 'TECHNOLOGY_ASSET', id: 'a' },
      { type: 'SUPPLIER', id: 'b' },
      { type: 'SUPPLIER', id: 'c' },
    ]);
    expect(result.edges.map(item => item.id)).toEqual(['one', 'two', 'three']);
    expect(result.truncated).toBe(false);
  });

  it('enforces the traversal node safety limit', () => {
    const edges: GraphEdge[] = Array.from({ length: 4 }, (_, index) => edge(String(index), 'root', 'node-' + index));
    const result = traverseVerifiedGraph(edges, { type: 'APPLICATION', id: 'root' }, 3);
    expect(result.nodes).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });
});
