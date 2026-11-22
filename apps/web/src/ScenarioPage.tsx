import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, AlertTriangle, Clock3, Play, RefreshCw } from 'lucide-react';
import { api } from './api';

type NodeType = 'BUSINESS_SERVICE' | 'BUSINESS_PROCESS' | 'APPLICATION' | 'TECHNOLOGY_ASSET' | 'SUPPLIER';
type ScenarioNode = { id: string; name: string; type: NodeType; criticality?: string };
type Template = { id: string; name: string; category: string; description: string; defaultSeverity: 'DEGRADED' | 'UNAVAILABLE'; recommendedDurationHours: number };
type ScenarioResult = {
  modelVersion: string;
  assumptions: string[];
  affectedNodes: Array<{ type: string; id: string; name: string; depth: number; path: string[] }>;
  affectedServices: Array<{ id: string; name: string; criticality: string; depth: number; path: string[]; rtoMinutes: number | null; priorityScore: number }>;
  summary: { affectedNodeCount: number; affectedServiceCount: number; criticalServices: number; highPriorityServices: number };
};
type ScenarioRun = { id: string; createdAt: string; templateId: string; notes: string | null; result: ScenarioResult };

const typeLabels: Record<NodeType, string> = {
  BUSINESS_SERVICE: 'Business service', BUSINESS_PROCESS: 'Business process',
  APPLICATION: 'Application', TECHNOLOGY_ASSET: 'Technology asset', SUPPLIER: 'Supplier',
};

export function ScenarioPage({ token }: { token: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [nodes, setNodes] = useState<ScenarioNode[]>([]);
  const [runs, setRuns] = useState<ScenarioRun[]>([]);
  const [templateId, setTemplateId] = useState('service-outage');
  const [rootType, setRootType] = useState<NodeType>('BUSINESS_SERVICE');
  const [rootId, setRootId] = useState('');
  const [severity, setSeverity] = useState<'DEGRADED' | 'UNAVAILABLE'>('UNAVAILABLE');
  const [durationHours, setDurationHours] = useState(8);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedRun, setSelectedRun] = useState<ScenarioRun | null>(null);

  async function refresh() {
    const [templateData, nodeData, runData] = await Promise.all([
      api<Template[]>('/scenarios/templates', {}, token),
      api<ScenarioNode[]>('/dependencies/nodes', {}, token),
      api<ScenarioRun[]>('/scenarios/runs', {}, token),
    ]);
    setTemplates(templateData); setNodes(nodeData); setRuns(runData);
  }
  useEffect(() => { refresh().catch(e => setError(e instanceof Error ? e.message : 'Unable to load scenarios.')); }, [token]);
  const filteredNodes = useMemo(() => nodes.filter(node => node.type === rootType), [nodes, rootType]);
  const template = templates.find(item => item.id === templateId);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const run = await api<ScenarioRun>('/scenarios/runs', {
        method: 'POST', body: JSON.stringify({ templateId, rootType, rootId, severity, durationHours, notes: notes || undefined }),
      }, token);
      setSelectedRun(run); setNotes('');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to run scenario.'); }
    finally { setBusy(false); }
  }

  return <div className="scenario-page">
    {error && <div className="notice error-notice" role="alert">{error}</div>}
    <div className="scenario-layout">
      <section className="panel scenario-form-panel">
        <div className="panel-heading"><div><h3>Scenario configuration</h3><p>Define a disruption and evaluate its recorded dependency footprint.</p></div><span className="mini-icon"><Activity size={17}/></span></div>
        <div className="scenario-template-grid">
          {templates.map(item => <button type="button" key={item.id} className={templateId === item.id ? 'scenario-template selected' : 'scenario-template'} onClick={() => { setTemplateId(item.id); setSeverity(item.defaultSeverity); setDurationHours(item.recommendedDurationHours); }}>
            <strong>{item.name}</strong><span>{item.description}</span><small>{item.category.replace('_', ' ')}</small>
          </button>)}
        </div>
        <form className="scenario-form" onSubmit={submit}>
          <label>Disruption target type<select value={rootType} onChange={e => { setRootType(e.target.value as NodeType); setRootId(''); }}><option value="BUSINESS_SERVICE">Business service</option><option value="BUSINESS_PROCESS">Business process</option><option value="APPLICATION">Application</option><option value="TECHNOLOGY_ASSET">Technology asset</option><option value="SUPPLIER">Supplier</option></select></label>
          <label>Target record<select required value={rootId} onChange={e => setRootId(e.target.value)}><option value="">Select a tenant record</option>{filteredNodes.map(node => <option key={node.id} value={node.id}>{node.name}{node.criticality ? ' · ' + node.criticality : ''}</option>)}</select></label>
          <div className="scenario-fields">
            <label>Disruption severity<select value={severity} onChange={e => setSeverity(e.target.value as 'DEGRADED' | 'UNAVAILABLE')}><option value="DEGRADED">Degraded</option><option value="UNAVAILABLE">Unavailable</option></select></label>
            <label>Duration (hours)<input type="number" min="1" max="720" value={durationHours} onChange={e => setDurationHours(Number(e.target.value))} required /></label>
          </div>
          <label>Scenario notes (optional)<textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Record assumptions specific to this exercise" /></label>
          <button className="primary-btn" disabled={busy || !rootId || !template}><Play size={16}/>{busy ? 'Calculating…' : 'Run scenario simulation'}</button>
        </form>
        <p className="scenario-disclaimer"><AlertTriangle size={15}/> Planning simulation only. No infrastructure or recovery actions are executed.</p>
      </section>
      <section className="panel scenario-history-panel">
        <div className="panel-heading"><div><h3>Simulation history</h3><p>Latest tenant-scoped, immutable run snapshots</p></div><button className="icon-btn" onClick={() => refresh().catch(e => setError(e.message))} aria-label="Refresh simulation history"><RefreshCw size={16}/></button></div>
        {runs.length ? <div className="scenario-run-list">{runs.map(run => <button type="button" key={run.id} className={selectedRun?.id === run.id ? 'scenario-run selected' : 'scenario-run'} onClick={() => setSelectedRun(run)}>
          <span><strong>{templates.find(t => t.id === run.templateId)?.name ?? run.templateId}</strong><small>{new Date(run.createdAt).toLocaleString()}</small></span>
          <span className="scenario-run-count">{run.result.summary.affectedServiceCount} services</span>
        </button>)}</div> : <div className="empty-state"><div className="empty-icon"><Clock3 size={22}/></div><strong>No simulations yet</strong><p>Run a scenario to create the first point-in-time impact snapshot.</p></div>}
      </section>
    </div>
    {selectedRun && <section className="panel scenario-results">
      <div className="panel-heading"><div><div className="eyebrow muted">MODEL {selectedRun.result.modelVersion}</div><h3>Impact analysis</h3><p>Snapshot created {new Date(selectedRun.createdAt).toLocaleString()}</p></div><span className="panel-count">{selectedRun.result.summary.affectedServiceCount} services impacted</span></div>
      <div className="scenario-metrics"><div><span>Affected nodes</span><strong>{selectedRun.result.summary.affectedNodeCount}</strong></div><div><span>Critical services</span><strong>{selectedRun.result.summary.criticalServices}</strong></div><div><span>High-priority services</span><strong>{selectedRun.result.summary.highPriorityServices}</strong></div></div>
      <div className="table-wrap"><table><thead><tr><th>BUSINESS SERVICE</th><th>CRITICALITY</th><th>PRIORITY SCORE</th><th>APPROVED RTO</th><th>DEPENDENCY DEPTH</th></tr></thead><tbody>{selectedRun.result.affectedServices.map(service => <tr key={service.id}><td><strong>{service.name}</strong><small className="scenario-path">{service.path.join(' → ')}</small></td><td>{service.criticality}</td><td><strong>{service.priorityScore}/100</strong></td><td>{service.rtoMinutes === null ? 'Unknown' : service.rtoMinutes + ' min'}</td><td>{service.depth}</td></tr>)}</tbody></table></div>
      {!selectedRun.result.affectedServices.length && <p className="scenario-empty-result">No business services were reachable through verified dependency edges from this target.</p>}
      <div className="scenario-assumptions"><strong>Model assumptions & limitations</strong><ul>{selectedRun.result.assumptions.map(item => <li key={item}>{item}</li>)}</ul></div>
    </section>}
  </div>;
}
