import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Plus } from 'lucide-react';
import { api } from './api';

type Process = { id: string; name: string; ownerName: string | null };
type Horizon = 'IMMEDIATE' | 'FOUR_HOURS' | 'TWENTY_FOUR_HOURS' | 'SEVENTY_TWO_HOURS' | 'ONE_WEEK';
type Scores = { horizon: Horizon; financial: number | ''; operational: number | ''; regulatory: number | ''; reputational: number | '' };
type Assessment = { id: string; version: number; status: string; ownerName: string; mtpdMinutes: number; rtoMinutes: number; impactScore: number; criticality: string; process: { name: string } };
const horizons: { value: Horizon; label: string }[] = [
  { value: 'IMMEDIATE', label: 'Immediate' }, { value: 'FOUR_HOURS', label: '4 hours' },
  { value: 'TWENTY_FOUR_HOURS', label: '24 hours' }, { value: 'SEVENTY_TWO_HOURS', label: '72 hours' }, { value: 'ONE_WEEK', label: '1 week' },
];
const dimensions = ['financial', 'operational', 'regulatory', 'reputational'] as const;
const dimensionLabels: Record<string, string> = { financial: 'Financial', operational: 'Operational', regulatory: 'Regulatory', reputational: 'Reputational' };
const emptyScores = (): Scores[] => horizons.map(h => ({ horizon: h.value, financial: '', operational: '', regulatory: '', reputational: '' }));
const duration = (n: number) => n < 60 ? n + ' min' : n % 60 === 0 ? n / 60 + ' hr' : Math.floor(n / 60) + ' hr ' + n % 60 + ' min';

export function BiaPage({ token }: { token: string }) {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [processId, setProcessId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mtpdMinutes, setMtpdMinutes] = useState('');
  const [rtoMinutes, setRtoMinutes] = useState('');
  const [rpoMinutes, setRpoMinutes] = useState('');
  const [rationale, setRationale] = useState('');
  const [scores, setScores] = useState<Scores[]>(emptyScores);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const results = await Promise.all([api<Process[]>('/bia/processes', {}, token), api<Assessment[]>('/bia', {}, token)]);
    setProcesses(results[0]); setAssessments(results[1]);
    if (!processId && results[0].length) setProcessId(results[0][0].id);
  }
  useEffect(() => {
    let active = true;
    Promise.all([api<Process[]>('/bia/processes', {}, token), api<Assessment[]>('/bia', {}, token)])
      .then(([p, a]) => { if (active) { setProcesses(p); setAssessments(a); setProcessId(p[0]?.id ?? ''); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load BIA workspace.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api<Assessment>('/bia', { method: 'POST', body: JSON.stringify({
        processId, ownerName, mtpdMinutes: Number(mtpdMinutes), rtoMinutes: Number(rtoMinutes),
        rpoMinutes: Number(rpoMinutes), rationale, impacts: scores.map(item => ({ ...item, financial: Number(item.financial), operational: Number(item.operational), regulatory: Number(item.regulatory), reputational: Number(item.reputational) })),
      }) }, token);
      await refresh(); setShowForm(false); setRationale(''); setNotice('Draft assessment saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save assessment.'); }
    finally { setBusy(false); }
  }
  async function transition(id: string, action: 'submit' | 'approve' | 'retire') {
    setBusy(true); setError(''); setNotice('');
    try { await api<Assessment>('/bia/' + id + '/' + action, { method: 'POST' }, token); await refresh(); setNotice(action === 'submit' ? 'Assessment submitted for review.' : action === 'approve' ? 'Assessment approved.' : 'Assessment retired.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update assessment.'); }
    finally { setBusy(false); }
  }
  function updateScore(index: number, dimension: typeof dimensions[number], value: number | '') {
    setScores(current => current.map((item, i) => i === index ? { ...item, [dimension]: value } : item));
  }

  return <section className="bia-page">
    <div className="bia-intro"><div><div className="eyebrow muted">RESILIENCE FOUNDATION / BUSINESS IMPACT ANALYSIS</div><h2>Business impact assessments</h2><p>Quantify disruption impact over time and define evidence-backed recovery objectives.</p></div><button className="primary-btn bia-create" onClick={() => { setShowForm(v => !v); setError(''); }} disabled={!processes.length}><Plus size={16}/>{showForm ? 'Close form' : 'New assessment'}</button></div>
    {error && <div className="notice error-notice"><AlertCircle size={16}/>{error}</div>}
    {notice && <div className="notice success-notice"><CheckCircle2 size={16}/>{notice}</div>}
    {showForm && <form className="panel bia-form" onSubmit={create}>
      <div className="panel-heading"><div><h3>New assessment draft</h3><p>Score each impact dimension from 1 (negligible) to 5 (severe).</p></div></div>
      <div className="bia-fields">
        <label>Business process<select required value={processId} onChange={e => setProcessId(e.target.value)}>{processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Assessment owner<input required minLength={2} maxLength={120} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Process owner"/></label>
        <label>MTPD (minutes)<input type="number" min="1" max="525600" required value={mtpdMinutes} onChange={e => setMtpdMinutes(e.target.value)}/></label>
        <label>RTO (minutes)<input type="number" min="1" max="525600" required value={rtoMinutes} onChange={e => setRtoMinutes(e.target.value)}/></label>
        <label>RPO (minutes)<input type="number" min="0" max="525600" required value={rpoMinutes} onChange={e => setRpoMinutes(e.target.value)}/></label>
      </div>
      <div className="bia-rule">RTO must be less than or equal to MTPD. RPO is zero or a positive duration.</div>
      <div className="bia-impact-heading"><h4>Impact by time horizon</h4><span>Scale: 1–5 for each dimension</span></div>
      <div className="table-wrap"><table className="bia-score-table"><thead><tr><th>TIME HORIZON</th>{dimensions.map(d => <th key={d}>{dimensionLabels[d].toUpperCase()}</th>)}</tr></thead><tbody>
        {scores.map((item, index) => <tr key={item.horizon}><td>{horizons[index].label}</td>{dimensions.map(d => <td key={d}><select required aria-label={horizons[index].label + ' ' + dimensionLabels[d] + ' impact'} value={item[d]} onChange={e => updateScore(index, d, e.target.value === '' ? 0 : Number(e.target.value))}><option value="" disabled>Select</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></td>)}</tr>)}
      </tbody></table></div>
      <label className="bia-rationale">Assessment rationale<textarea required minLength={10} maxLength={10000} value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Explain assumptions, impact evidence and recovery objective rationale…"/></label>
      <div className="bia-form-actions"><span>Score and criticality are calculated by the API.</span><button className="primary-btn" disabled={busy || !processId}>{busy ? 'Saving…' : 'Save draft'}</button></div>
    </form>}
    <div className="panel bia-list"><div className="panel-heading"><div><h3>Assessment register</h3><p>Tenant-scoped records and approval status</p></div><span className="panel-count">{assessments.length} records</span></div>
      {loading ? <div className="bia-empty">Loading assessments…</div> : !assessments.length ? <div className="bia-empty"><ClipboardList size={25}/><strong>No business impact assessments yet</strong><span>Create an assessment after adding business processes to your workspace.</span></div> : <div className="table-wrap"><table><thead><tr><th>BUSINESS PROCESS</th><th>VERSION</th><th>CRITICALITY</th><th>IMPACT SCORE</th><th>RTO / MTPD</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {assessments.map(a => <tr key={a.id}><td><strong>{a.process.name}</strong><small className="bia-owner">Owner: {a.ownerName}</small></td><td>v{a.version}</td><td><span className={'tier tier-' + a.criticality.toLowerCase()}>{a.criticality}</span></td><td>{a.impactScore}/20</td><td>{duration(a.rtoMinutes)} / {duration(a.mtpdMinutes)}</td><td><span className={'status status-' + a.status.toLowerCase()}>{a.status.replace('_', ' ')}</span></td><td>{a.status === 'DRAFT' ? <button className="bia-action" disabled={busy} onClick={() => transition(a.id, 'submit')}>Submit</button> : a.status === 'IN_REVIEW' ? <button className="bia-action" disabled={busy} onClick={() => transition(a.id, 'approve')}>Approve</button>  : a.status === 'APPROVED' ? <button className="bia-action" disabled={busy} onClick={() => transition(a.id, 'retire')}>Retire</button> : <span className="bia-muted">—</span>}</td></tr>)}
      </tbody></table></div>}
    </div>
    <div className="bia-method"><strong>Scoring methodology</strong><span>For each horizon, four dimensions are added (4–20). The highest horizon total determines criticality: 16–20 Critical, 12–15 High, 8–11 Medium, 4–7 Low. This is a fixed transparent baseline, not a configurable policy.</span></div>
  </section>;
}
