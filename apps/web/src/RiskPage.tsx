import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Plus, ShieldAlert, ShieldCheck, Target } from 'lucide-react';
import { api } from './api';

type Control = { id: string; name: string; description: string; controlType: string; ownerName: string; frequency: string; status: string; lastTestedAt: string | null; testEvidence: string | null };
type Link = { id: string; effectiveness: number; notes: string | null; control: Control };
type Treatment = { id: string; title: string; ownerName: string; dueAt: string; status: string };
type Risk = { id: string; title: string; description: string; category: string; ownerName: string; likelihood: number; impact: number; inherentScore: number; residualScore: number; status: string; targetType: string | null; targetId: string | null; controls: Link[]; treatments: Treatment[] };
type Target = { id: string; name: string; type: string };
type DependencyTarget = { id: string; type: string; status: string; sourceType: string; targetType: string };
type Summary = { totalRisks: number; criticalRisks: number; highRisks: number; averageResidualScore: number; controls: Record<string, number> };

const band = (score: number) => score >= 17 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'moderate' : 'low';
const dateInput = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function RiskPage({ token }: { token: string }) {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [dependencyTargets, setDependencyTargets] = useState<DependencyTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showRisk, setShowRisk] = useState(false);
  const [showControl, setShowControl] = useState(false);
  const [riskForm, setRiskForm] = useState({ title: '', description: '', category: 'Technology', ownerName: '', likelihood: '3', impact: '3', targetType: '', targetId: '' });
  const [controlForm, setControlForm] = useState({ name: '', description: '', controlType: 'Preventive', ownerName: '', frequency: 'Continuous' });
  const [linkForms, setLinkForms] = useState<Record<string, { controlId: string; effectiveness: string }>>({});
  const [treatmentForms, setTreatmentForms] = useState<Record<string, { title: string; ownerName: string; dueAt: string }>>({});
  const [testEvidence, setTestEvidence] = useState<Record<string, string>>({});

  async function refresh() {
    const [r, c, summaryData, nodes, edges] = await Promise.all([api<Risk[]>('/risks', {}, token), api<Control[]>('/risks/controls', {}, token), api<Summary>('/risks/summary', {}, token), api<Target[]>('/dependencies/nodes', {}, token), api<DependencyTarget[]>('/dependencies', {}, token)]);
    setRisks(r); setControls(c); setSummary(summaryData); setTargets(nodes); setDependencyTargets(edges);
  }
  useEffect(() => {
    let active = true;
    Promise.all([api<Risk[]>('/risks', {}, token), api<Control[]>('/risks/controls', {}, token), api<Summary>('/risks/summary', {}, token), api<Target[]>('/dependencies/nodes', {}, token), api<DependencyTarget[]>('/dependencies', {}, token)])
      .then(([r, c, summaryData, nodes, edges]) => { if (active) { setRisks(r); setControls(c); setSummary(summaryData); setTargets(nodes); setDependencyTargets(edges); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load risk workspace.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function run(action: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); setNotice(message); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'The action could not be completed.'); return false; }
    finally { setBusy(false); }
  }
  async function createRisk(e: FormEvent) {
    e.preventDefault();
    const saved = await run(() => api('/risks', { method: 'POST', body: JSON.stringify({ ...riskForm, targetType: riskForm.targetType || undefined, targetId: riskForm.targetId || undefined, likelihood: Number(riskForm.likelihood), impact: Number(riskForm.impact) }) }, token), 'Risk recorded and inherent score calculated.');
    if (saved) { setShowRisk(false); setRiskForm({ title: '', description: '', category: 'Technology', ownerName: '', likelihood: '3', impact: '3', targetType: '', targetId: '' }); }
  }
  async function createControl(e: FormEvent) {
    e.preventDefault();
    const saved = await run(() => api('/risks/controls', { method: 'POST', body: JSON.stringify(controlForm) }, token), 'Control added to the tenant control library.');
    if (saved) { setShowControl(false); setControlForm({ name: '', description: '', controlType: 'Preventive', ownerName: '', frequency: 'Continuous' }); }
  }
  async function linkControl(e: FormEvent, risk: Risk) {
    e.preventDefault();
    const value = linkForms[risk.id];
    if (!value?.controlId) return;
    await run(() => api('/risks/' + risk.id + '/controls', { method: 'POST', body: JSON.stringify({ controlId: value.controlId, effectiveness: Number(value.effectiveness) }) }, token), 'Control linked; residual risk recalculated.');
  }
  async function addTreatment(e: FormEvent, risk: Risk) {
    e.preventDefault();
    const value = treatmentForms[risk.id];
    if (!value) return;
    await run(() => api('/risks/' + risk.id + '/treatments', { method: 'POST', body: JSON.stringify({ ...value, dueAt: new Date(value.dueAt + 'T12:00:00.000Z').toISOString() }) }, token), 'Risk treatment action created.');
  }

  return <section className="risk-page">
    <div className="risk-intro"><div><div className="eyebrow muted">MILESTONE 07 / OPERATIONAL RISK & CONTROL</div><h2>Risk register & control assurance</h2><p>Prioritize exposure, connect tested controls and track accountable treatment actions.</p></div><div className="risk-actions"><button className="secondary-btn" onClick={() => setShowControl(v => !v)}><ShieldCheck size={15}/>{showControl ? 'Close control form' : 'Add control'}</button><button className="primary-btn" onClick={() => setShowRisk(v => !v)}><Plus size={15}/>{showRisk ? 'Close form' : 'New risk'}</button></div></div>
    {error && <div className="notice error-notice"><AlertCircle size={16}/>{error}</div>}
    {notice && <div className="notice success-notice"><CheckCircle2 size={16}/>{notice}</div>}
    <div className="risk-metrics">
      <article className="metric-card"><div className="metric-top"><span>Open risks</span><span className="metric-icon blue"><Target size={17}/></span></div><div className="metric-value">{summary?.totalRisks ?? '—'}</div><div className="metric-detail">Active register items</div></article>
      <article className="metric-card"><div className="metric-top"><span>Critical residual</span><span className="metric-icon rose"><ShieldAlert size={17}/></span></div><div className="metric-value">{summary?.criticalRisks ?? '—'}</div><div className="metric-detail">Score 17–25 after controls</div></article>
      <article className="metric-card"><div className="metric-top"><span>High residual</span><span className="metric-icon violet"><AlertCircle size={17}/></span></div><div className="metric-value">{summary?.highRisks ?? '—'}</div><div className="metric-detail">Score 10–16 after controls</div></article>
      <article className="metric-card"><div className="metric-top"><span>Average residual</span><span className="metric-icon teal"><CheckCircle2 size={17}/></span></div><div className="metric-value">{summary?.averageResidualScore ?? '—'}<small>/25</small></div><div className="metric-detail">Portfolio exposure score</div></article>
    </div>
    {showRisk && <form className="panel risk-form" onSubmit={createRisk}>
      <div className="panel-heading"><div><h3>Identify an operational risk</h3><p>Likelihood × impact creates the inherent score; residual score changes as tested controls are linked.</p></div></div>
      <div className="risk-fields">
        <label>Risk title<input required minLength={3} maxLength={180} value={riskForm.title} onChange={e => setRiskForm(v => ({ ...v, title: e.target.value }))} placeholder="e.g. Primary cloud region outage"/></label>
        <label>Category<select value={riskForm.category} onChange={e => setRiskForm(v => ({ ...v, category: e.target.value }))}>{['Technology','Cybersecurity','Third-party','People','Process','Regulatory','Facilities','Data'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Risk owner<input required minLength={2} value={riskForm.ownerName} onChange={e => setRiskForm(v => ({ ...v, ownerName: e.target.value }))} placeholder="Accountable owner"/></label>
        <label>Likelihood (1–5)<select value={riskForm.likelihood} onChange={e => setRiskForm(v => ({ ...v, likelihood: e.target.value }))}>{[1,2,3,4,5].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Impact (1–5)<select value={riskForm.impact} onChange={e => setRiskForm(v => ({ ...v, impact: e.target.value }))}>{[1,2,3,4,5].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Target type (optional)<select value={riskForm.targetType} onChange={e => setRiskForm(v => ({ ...v, targetType: e.target.value, targetId: '' }))}><option value="">No linked target</option>{['BUSINESS_SERVICE','BUSINESS_PROCESS','APPLICATION','TECHNOLOGY_ASSET','SUPPLIER','DEPENDENCY'].map(x => <option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
        <label>Linked service / asset / dependency<select value={riskForm.targetId} disabled={!riskForm.targetType} onChange={e => setRiskForm(v => ({ ...v, targetId: e.target.value }))}><option value="">Select target…</option>{(riskForm.targetType === 'DEPENDENCY' ? dependencyTargets.filter(d => d.status !== 'RETIRED').map(d => ({ id: d.id, name: d.sourceType.replaceAll('_',' ') + ' → ' + d.targetType.replaceAll('_',' ') + ' (' + d.status + ')' })) : targets.filter(t => t.type === riskForm.targetType)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      </div>
      <label className="risk-wide">Risk statement<textarea required minLength={10} maxLength={10000} value={riskForm.description} onChange={e => setRiskForm(v => ({ ...v, description: e.target.value }))} placeholder="Describe the cause, uncertain event and operational consequence…"/></label>
      <div className="risk-form-foot"><span>Scoring bands: 1–4 low · 5–9 moderate · 10–16 high · 17–25 critical</span><button className="primary-btn" disabled={busy}>Save risk</button></div>
    </form>}
    {showControl && <form className="panel risk-form" onSubmit={createControl}>
      <div className="panel-heading"><div><h3>Control library entry</h3><p>New controls begin in Design status and cannot reduce residual risk until tested with evidence.</p></div></div>
      <div className="risk-fields">
        <label>Control name<input required minLength={3} value={controlForm.name} onChange={e => setControlForm(v => ({ ...v, name: e.target.value }))} placeholder="e.g. Multi-region backup validation"/></label>
        <label>Control type<select value={controlForm.controlType} onChange={e => setControlForm(v => ({ ...v, controlType: e.target.value }))}>{['Preventive','Detective','Corrective','Recovery'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Control owner<input required minLength={2} value={controlForm.ownerName} onChange={e => setControlForm(v => ({ ...v, ownerName: e.target.value }))} placeholder="Control owner"/></label>
        <label>Frequency<select value={controlForm.frequency} onChange={e => setControlForm(v => ({ ...v, frequency: e.target.value }))}>{['Continuous','Daily','Weekly','Monthly','Quarterly','Annually','Event-driven'].map(x => <option key={x}>{x}</option>)}</select></label>
      </div>
      <label className="risk-wide">Control description<textarea required minLength={10} value={controlForm.description} onChange={e => setControlForm(v => ({ ...v, description: e.target.value }))} placeholder="Describe the control objective and how it operates…"/></label>
      <div className="risk-form-foot"><span>Control testing requires a recorded evidence summary.</span><button className="primary-btn" disabled={busy}>Add control</button></div>
    </form>}
    <section className="panel risk-register"><div className="panel-heading"><div><h3>Operational risk register</h3><p>Ranked by residual exposure · tenant-scoped records</p></div><span className="panel-count">{risks.length} risks</span></div>
      {loading ? <div className="risk-empty">Loading risk register…</div> : !risks.length ? <div className="risk-empty"><ShieldAlert size={25}/><strong>No risks recorded yet</strong><span>Identify your first operational risk to start measuring resilience exposure.</span></div> : <div className="risk-list">{risks.map(risk => <article className="risk-card" key={risk.id}>
        <div className="risk-card-head"><div><div className="risk-meta"><span className={'tier tier-' + band(risk.residualScore)}>{band(risk.residualScore).toUpperCase()} RESIDUAL</span><span>{risk.category}</span><span>{risk.status.replace('_',' ')}</span></div><h3>{risk.title}</h3><p>{risk.description}</p><small>Owner: {risk.ownerName}</small></div><div className="risk-score"><strong>{risk.residualScore}</strong><span>of 25</span><small>Inherent {risk.inherentScore}</small></div></div>
        <div className="risk-progress"><div><span>Likelihood {risk.likelihood}/5</span><span>Impact {risk.impact}/5</span></div><div className="risk-bar"><i style={{width: (risk.residualScore / 25 * 100) + '%'}}/></div></div>
        <div className="risk-detail-grid"><div><strong>Controls ({risk.controls.length})</strong>{risk.controls.length ? risk.controls.map(link => <div className="risk-subitem" key={link.id}><span>{link.control.name}</span><b>{link.effectiveness}%</b><small>{link.control.status}</small></div>) : <small>No controls linked</small>}</div><div><strong>Treatment actions ({risk.treatments.length})</strong>{risk.treatments.length ? risk.treatments.map(t => <div className="risk-subitem" key={t.id}><span>{t.title}</span><b>{t.status.replace('_',' ')}</b><small>{t.ownerName} · due {new Date(t.dueAt).toLocaleDateString()}</small></div>) : <small>No treatment actions</small>}</div></div>
        <div className="risk-card-actions">
          <form onSubmit={e => linkControl(e, risk)}><select aria-label={'Control for ' + risk.title} value={linkForms[risk.id]?.controlId ?? ''} onChange={e => setLinkForms(v => ({ ...v, [risk.id]: { controlId: e.target.value, effectiveness: controls.find(c => c.id === e.target.value)?.status === 'TESTED' ? (v[risk.id]?.effectiveness ?? '50') : '0' } }))}><option value="">Link control…</option>{controls.filter(c => !risk.controls.some(x => x.control.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}</select><select aria-label="Control effectiveness" value={linkForms[risk.id]?.effectiveness ?? '50'} onChange={e => setLinkForms(v => ({ ...v, [risk.id]: { controlId: v[risk.id]?.controlId ?? '', effectiveness: e.target.value } }))}>{(controls.find(c => c.id === linkForms[risk.id]?.controlId)?.status === 'TESTED' ? [0,10,20,30,40,50,60,70,80,90,100] : [0]).map(n => <option key={n} value={n}>{n}% effective</option>)}</select><button className="bia-action" disabled={busy || !controls.some(c => c.id === linkForms[risk.id]?.controlId)}>Link</button></form>
          <form onSubmit={e => addTreatment(e, risk)}><input required aria-label="Treatment action" placeholder="Treatment action" value={treatmentForms[risk.id]?.title ?? ''} onChange={e => setTreatmentForms(v => ({ ...v, [risk.id]: { title: e.target.value, ownerName: v[risk.id]?.ownerName ?? risk.ownerName, dueAt: v[risk.id]?.dueAt ?? dateInput(30) } }))}/><input required aria-label="Treatment owner" placeholder="Owner" value={treatmentForms[risk.id]?.ownerName ?? risk.ownerName} onChange={e => setTreatmentForms(v => ({ ...v, [risk.id]: { title: v[risk.id]?.title ?? '', ownerName: e.target.value, dueAt: v[risk.id]?.dueAt ?? dateInput(30) } }))}/><input required type="date" aria-label="Treatment due date" value={treatmentForms[risk.id]?.dueAt ?? dateInput(30)} onChange={e => setTreatmentForms(v => ({ ...v, [risk.id]: { title: v[risk.id]?.title ?? '', ownerName: v[risk.id]?.ownerName ?? risk.ownerName, dueAt: e.target.value } }))}/><button className="bia-action" disabled={busy}>Add action</button></form>
          <select aria-label="Risk lifecycle" value={risk.status} disabled={busy || risk.status === 'CLOSED'} onChange={e => run(() => api('/risks/' + risk.id + '/status', { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }, token), 'Risk lifecycle updated.')}><option value="IDENTIFIED">Identified</option><option value="ASSESSED">Assessed</option><option value="TREATING">Treating</option><option value="ACCEPTED">Accepted</option><option value="CLOSED">Closed</option></select>
        </div>
      </article>)}</div>}
    </section>
    <section className="panel control-register"><div className="panel-heading"><div><h3>Control assurance library</h3><p>Design, implementation and evidence-backed testing</p></div><span className="panel-count">{controls.length} controls</span></div>
      {!controls.length ? <div className="risk-empty">No controls added yet.</div> : <div className="table-wrap"><table><thead><tr><th>CONTROL</th><th>TYPE</th><th>OWNER / FREQUENCY</th><th>STATUS</th><th>TEST EVIDENCE</th></tr></thead><tbody>{controls.map(control => <tr key={control.id}><td><strong>{control.name}</strong><small className="bia-owner">{control.description}</small></td><td>{control.controlType}</td><td>{control.ownerName}<small className="bia-owner">{control.frequency}</small>{control.lastTestedAt && <small className="bia-owner">Tested {new Date(control.lastTestedAt).toLocaleDateString()}</small>}</td><td><span className={'status status-' + control.status.toLowerCase()}>{control.status.replace('_',' ')}</span><select aria-label={'Control lifecycle for ' + control.name} value={control.status} disabled={busy} onChange={e => void run(() => api('/risks/controls/' + control.id + '/status', { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }, token), 'Control status updated; dependent residual risks recalculated where required.')}><option value="DESIGN">Design</option><option value="IMPLEMENTED">Implemented</option><option value="NEEDS_REMEDIATION">Needs remediation</option><option value="TESTED" disabled>Tested (use evidence form)</option></select></td><td>{control.testEvidence && <small className="bia-owner">{control.testEvidence}</small>}<form className="control-test-form" onSubmit={e => { e.preventDefault(); void run(() => api('/risks/controls/' + control.id + '/status', { method: 'PATCH', body: JSON.stringify({ status: 'TESTED', testEvidence: testEvidence[control.id] }) }, token), 'Control marked tested with recorded evidence.'); }}><input required minLength={20} placeholder="Test result / evidence (20+ chars)" value={testEvidence[control.id] ?? ''} onChange={e => setTestEvidence(v => ({ ...v, [control.id]: e.target.value }))}/><button className="bia-action" disabled={busy || control.status === 'TESTED'}>Record test</button></form></td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
