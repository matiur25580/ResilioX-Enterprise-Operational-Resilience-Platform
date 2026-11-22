import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, GitBranch, Plus, RefreshCw } from 'lucide-react';
import { api } from './api';

type NodeType = 'BUSINESS_SERVICE' | 'BUSINESS_PROCESS' | 'APPLICATION' | 'TECHNOLOGY_ASSET' | 'SUPPLIER';
type DependencyNode = { id: string; name: string; type: NodeType; criticality?: string; status?: string; assetType?: string; vendor?: string };
type Dependency = { id: string; sourceType: NodeType; sourceId: string; targetType: NodeType; targetId: string; type: string; status: string; criticality: string; confidence: number; sourceName: string; targetName: string };
type Graph = { root: { type: NodeType; id: string }; nodes: { type: NodeType; id: string }[]; edges: Dependency[]; truncated: boolean; traversal: string };
const nodeTypes: { value: NodeType; label: string }[] = [
  { value: 'BUSINESS_SERVICE', label: 'Business service' }, { value: 'BUSINESS_PROCESS', label: 'Business process' },
  { value: 'APPLICATION', label: 'Application' }, { value: 'TECHNOLOGY_ASSET', label: 'Technology asset' }, { value: 'SUPPLIER', label: 'Supplier' },
];
const relationTypes = ['SUPPORTS', 'HOSTED_ON', 'DEPENDS_ON', 'PROVIDED_BY', 'OPERATES_FROM', 'PROCESSED_BY'];
const nodeLabel = (type: NodeType) => nodeTypes.find(item => item.value === type)?.label ?? type;
const statusClass = (status: string) => 'status status-' + status.toLowerCase();

export function DependencyPage({ token }: { token: string }) {
  const [nodes, setNodes] = useState<DependencyNode[]>([]);
  const [edges, setEdges] = useState<Dependency[]>([]);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [sourceType, setSourceType] = useState<NodeType>('BUSINESS_SERVICE');
  const [sourceId, setSourceId] = useState('');
  const [targetType, setTargetType] = useState<NodeType>('APPLICATION');
  const [targetId, setTargetId] = useState('');
  const [relation, setRelation] = useState('DEPENDS_ON');
  const [criticality, setCriticality] = useState('MEDIUM');
  const [confidence, setConfidence] = useState('75');
  const [rootType, setRootType] = useState<NodeType>('BUSINESS_SERVICE');
  const [rootId, setRootId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sourceOptions = useMemo(() => nodes.filter(node => node.type === sourceType), [nodes, sourceType]);
  const targetOptions = useMemo(() => nodes.filter(node => node.type === targetType), [nodes, targetType]);
  const rootOptions = useMemo(() => nodes.filter(node => node.type === rootType), [nodes, rootType]);

  async function loadGraph(type = rootType, id = rootId) {
    if (!id) { setGraph(null); return; }
    try { setGraph(await api<Graph>('/dependencies/graph?nodeType=' + type + '&nodeId=' + id, {}, token)); }
    catch (e) { setGraph(null); setError(e instanceof Error ? e.message : 'Unable to calculate dependency paths.'); }
  }
  async function refresh() {
    const [nodeRows, edgeRows] = await Promise.all([api<DependencyNode[]>('/dependencies/nodes', {}, token), api<Dependency[]>('/dependencies', {}, token)]);
    setNodes(nodeRows); setEdges(edgeRows);
    const first = nodeRows.find(node => node.type === rootType) ?? nodeRows[0];
    if (first && !rootId) { setRootType(first.type); setRootId(first.id); await loadGraph(first.type, first.id); }
    else if (rootId) await loadGraph();
    if (!sourceId && nodeRows.length) { const n = nodeRows.find(node => node.type === sourceType); if (n) setSourceId(n.id); }
    if (!targetId && nodeRows.length) { const n = nodeRows.find(node => node.type === targetType); if (n) setTargetId(n.id); }
  }
  useEffect(() => {
    let active = true;
    Promise.all([api<DependencyNode[]>('/dependencies/nodes', {}, token), api<Dependency[]>('/dependencies', {}, token)])
      .then(async ([nodeRows, edgeRows]) => {
        if (!active) return;
        setNodes(nodeRows); setEdges(edgeRows);
        const first = nodeRows.find(node => node.type === 'BUSINESS_SERVICE') ?? nodeRows[0];
        if (first) { setRootType(first.type); setRootId(first.id); const result = await api<Graph>('/dependencies/graph?nodeType=' + first.type + '&nodeId=' + first.id, {}, token); if (active) setGraph(result); }
        const source = nodeRows.find(node => node.type === 'BUSINESS_SERVICE') ?? nodeRows[0];
        const target = nodeRows.find(node => node.type === 'APPLICATION') ?? nodeRows.find(node => node.id !== source?.id);
        if (active) { setSourceId(source?.id ?? ''); setSourceType(source?.type ?? 'BUSINESS_SERVICE'); setTargetId(target?.id ?? ''); setTargetType(target?.type ?? 'APPLICATION'); }
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load dependency workspace.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api<Dependency>('/dependencies', { method: 'POST', body: JSON.stringify({ sourceType, sourceId, targetType, targetId, type: relation, criticality, confidence: Number(confidence) }) }, token);
      await refresh(); setShowForm(false); setNotice('Dependency saved as proposed; verify it after reviewing the relationship.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create dependency.'); }
    finally { setBusy(false); }
  }
  async function changeStatus(id: string, status: string) {
    setBusy(true); setError(''); setNotice('');
    try { await api<Dependency>('/dependencies/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }, token); await refresh(); setNotice('Dependency status updated.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update dependency.'); }
    finally { setBusy(false); }
  }
  function updateNodeType(side: 'source' | 'target', value: NodeType) {
    const first = nodes.find(node => node.type === value);
    if (side === 'source') { setSourceType(value); setSourceId(first?.id ?? ''); }
    else { setTargetType(value); setTargetId(first?.id ?? ''); }
  }

  return <section className="dependency-page">
    <div className="dependency-intro"><div><div className="eyebrow muted">RESILIENCE FOUNDATION / MILESTONE 06</div><h2>Dependency intelligence</h2><p>Map typed relationships across services, processes, applications, assets and suppliers.</p></div><button className="primary-btn" onClick={() => { setShowForm(v => !v); setError(''); }} disabled={!nodes.length}><Plus size={16}/>{showForm ? 'Close form' : 'Add relationship'}</button></div>
    {error && <div className="notice error-notice"><AlertCircle size={16}/>{error}</div>}{notice && <div className="notice success-notice"><CheckCircle2 size={16}/>{notice}</div>}
    {showForm && <form className="panel dependency-form" onSubmit={create}>
      <div className="panel-heading"><div><h3>Propose a dependency</h3><p>Source points to the target. New relationships require verification before impact traversal.</p></div></div>
      <div className="dependency-form-grid">
        <label>Source type<select value={sourceType} onChange={e => updateNodeType('source', e.target.value as NodeType)}>{nodeTypes.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}</select></label>
        <label>Source node<select required value={sourceId} onChange={e => setSourceId(e.target.value)}>{sourceOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
        <label>Relationship<select value={relation} onChange={e => setRelation(e.target.value)}>{relationTypes.map(r => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Target type<select value={targetType} onChange={e => updateNodeType('target', e.target.value as NodeType)}>{nodeTypes.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}</select></label>
        <label>Target node<select required value={targetId} onChange={e => setTargetId(e.target.value)}>{targetOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
        <label>Criticality<select value={criticality} onChange={e => setCriticality(e.target.value)}>{['CRITICAL','HIGH','MEDIUM','LOW'].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Confidence (%)<input type="number" min="0" max="100" value={confidence} onChange={e => setConfidence(e.target.value)}/></label>
      </div>
      <div className="dependency-form-actions"><span>Cycles, cross-tenant endpoints and duplicate relationships are rejected by the API.</span><button className="primary-btn" disabled={busy || !sourceId || !targetId || sourceId === targetId}>{busy ? 'Saving…' : 'Save proposed relationship'}</button></div>
    </form>}
    <div className="dependency-grid">
      <section className="panel dependency-register"><div className="panel-heading"><div><h3>Dependency register</h3><p>Tenant-scoped relationships · latest 500</p></div><span className="panel-count">{edges.length} edges</span></div>
        {loading ? <div className="bia-empty">Loading relationships…</div> : !edges.length ? <div className="bia-empty"><GitBranch size={24}/><strong>No dependencies mapped</strong><span>Add a proposed relationship, then verify it to include it in impact paths.</span></div> : <div className="table-wrap"><table><thead><tr><th>SOURCE</th><th>RELATIONSHIP</th><th>TARGET</th><th>CRITICALITY</th><th>CONFIDENCE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
          {edges.map(edge => <tr key={edge.id}><td><strong>{edge.sourceName}</strong><small className="dependency-type">{nodeLabel(edge.sourceType)}</small></td><td>{edge.type.replaceAll('_',' ')}</td><td><strong>{edge.targetName}</strong><small className="dependency-type">{nodeLabel(edge.targetType)}</small></td><td><span className={'tier tier-' + edge.criticality.toLowerCase()}>{edge.criticality}</span></td><td>{edge.confidence}%</td><td><span className={statusClass(edge.status)}>{edge.status}</span></td><td>{edge.status === 'PROPOSED' ? <><button className="bia-action" disabled={busy} onClick={() => changeStatus(edge.id, 'VERIFIED')}>Verify</button> <button className="bia-action" disabled={busy} onClick={() => changeStatus(edge.id, 'DISPUTED')}>Dispute</button></> : edge.status === 'DISPUTED' ? <button className="bia-action" disabled={busy} onClick={() => changeStatus(edge.id, 'VERIFIED')}>Verify</button> : edge.status === 'VERIFIED' ? <button className="bia-action" disabled={busy} onClick={() => changeStatus(edge.id, 'DISPUTED')}>Dispute</button> : <span className="bia-muted">—</span>}</td></tr>)}
        </tbody></table></div>}
      </section>
      <section className="panel impact-path-panel"><div className="panel-heading"><div><h3>Verified dependency paths</h3><p>Directed reachability from a selected node</p></div><span className="mini-icon"><GitBranch size={16}/></span></div>
        <div className="impact-root-select"><label>Start node type<select value={rootType} onChange={e => { const t = e.target.value as NodeType; setRootType(t); setRootId(nodes.find(n => n.type === t)?.id ?? ''); setGraph(null); }}>{nodeTypes.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}</select></label><label>Start node<select value={rootId} onChange={e => { setRootId(e.target.value); loadGraph(rootType, e.target.value); }}>{rootOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><button className="secondary-btn" onClick={() => loadGraph()} disabled={!rootId}><RefreshCw size={13}/> Recalculate</button></div>
        {!rootId ? <div className="bia-empty">Add catalog records to calculate dependency paths.</div> : !graph ? <div className="bia-empty">No verified paths available for this node.</div> : <div className="impact-path-content"><div className="impact-root"><span className="impact-node-type">{nodeLabel(graph.root.type)}</span><strong>{nodes.find(n => n.id === graph.root.id)?.name ?? 'Selected node'}</strong><small>Traversal root</small></div>{graph.edges.length ? <div className="impact-path-list">{graph.edges.map(edge => <div className="impact-path-row" key={edge.id}><span className="impact-path-arrow">↓</span><div><strong>{edge.targetName}</strong><small>{edge.type.replaceAll('_',' ')} · {nodeLabel(edge.targetType)}</small></div><span className={'tier tier-' + edge.criticality.toLowerCase()}>{edge.criticality}</span></div>)}</div> : <div className="bia-empty">No verified outgoing relationships from this node.</div>}{graph.truncated && <div className="dependency-truncated">Traversal reached the 200-node safety limit. Refine the starting node.</div>}<div className="impact-path-meta">{graph.nodes.length} nodes · {graph.edges.length} verified relationships · deterministic breadth-first traversal</div></div>}
      </section>
    </div>
    <div className="bia-method"><strong>Graph semantics and safeguards</strong><span>Edges are directed from source to target. Only verified relationships participate in impact-path traversal. Proposed, disputed and retired relationships remain visible in the register but are excluded from traversal. Traversal is deterministic, cycle-safe and capped at 200 nodes. Relationship types are stored as typed metadata; endpoint ownership is checked against the active tenant.</span></div>
  </section>;
}
