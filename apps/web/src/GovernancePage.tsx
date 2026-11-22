import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { BadgeCheck, BookOpenCheck, FileCheck2, History, Plus, RefreshCw, ShieldCheck } from 'lucide-react';

type Evidence = { id: string; title: string; evidenceType: string; status: string; referenceUri: string; expiresAt: string | null; isExpired?: boolean; createdBy: { id: string; displayName: string }; reviewedBy?: { id: string; displayName: string } | null };
type Policy = { id: string; name: string; framework: string; controlReference: string; description: string; status: string; owner: { displayName: string }; evidenceLinks: Array<{ evidence: { id: string; title: string; status: string } }> };
type AuditEvent = { id: string; action: string; targetType: string | null; targetId: string | null; actor: { displayName: string } | null; occurredAt: string; metadata: unknown };

export function GovernancePage({ token }: { token: string }) {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceType, setEvidenceType] = useState('AUDIT_REPORT');
  const [referenceUri, setReferenceUri] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [policyName, setPolicyName] = useState('');
  const [framework, setFramework] = useState('ISO 22301');
  const [controlReference, setControlReference] = useState('');
  const [policyDescription, setPolicyDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const [e, p] = await Promise.all([
      api<Evidence[]>('/governance/evidence', {}, token),
      api<Policy[]>('/governance/policies', {}, token),
    ]);
    let a: AuditEvent[] = [];
    try { a = await api<AuditEvent[]>('/governance/audit/events?limit=40', {}, token); } catch { /* audit:read is intentionally not granted to VIEWER */ }
    setEvidence(e); setPolicies(p); setEvents(a);
    if (!selectedEvidence && e[0]) setSelectedEvidence(e[0].id);
    if (!selectedPolicy && p[0]) setSelectedPolicy(p[0].id);
  }
  useEffect(() => { refresh().catch(e => setError(e instanceof Error ? e.message : 'Unable to load governance records.')); }, [token]);

  async function action(path: string, body?: unknown) {
    setBusy(true); setError(''); setMessage('');
    try { await api(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }, token); setMessage('Governance record updated.'); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  }
  async function createEvidence(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const created = await api<Evidence>('/governance/evidence', { method: 'POST', body: JSON.stringify({ title: evidenceTitle, evidenceType, referenceUri, description: evidenceDescription || undefined }) }, token);
      setEvidenceTitle(''); setReferenceUri(''); setEvidenceDescription(''); await refresh(); setSelectedEvidence(created.id); setMessage('Evidence reference created as a draft.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create evidence.'); }
    finally { setBusy(false); }
  }
  async function createPolicy(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const created = await api<Policy>('/governance/policies', { method: 'POST', body: JSON.stringify({ name: policyName, framework, controlReference, description: policyDescription }) }, token);
      setPolicyName(''); setControlReference(''); setPolicyDescription(''); await refresh(); setSelectedPolicy(created.id); setMessage('Policy created as a draft.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create policy.'); }
    finally { setBusy(false); }
  }

  return <div className="governance-page">
    {error && <div className="notice error-notice" role="alert" aria-atomic="true">{error}</div>}
    {message && <div className="notice success-notice" role="status" aria-live="polite" aria-atomic="true">{message}</div>}
    <div className="governance-metrics"><div><FileCheck2/><span>Evidence records</span><strong>{evidence.length}</strong></div><div><BookOpenCheck/><span>Policies in register</span><strong>{policies.length}</strong></div><div><History/><span>Recent audit events</span><strong>{events.length}</strong></div></div>
    <div className="governance-grid">
      <section className="panel governance-panel">
        <div className="panel-heading"><div><h3>Evidence register</h3><p>Track references, provenance and independent review status</p></div><BadgeCheck size={18}/></div>
        <form className="governance-form" onSubmit={createEvidence}>
          <label>Evidence title<input required minLength={3} maxLength={180} value={evidenceTitle} onChange={e=>setEvidenceTitle(e.target.value)} placeholder="Independent audit report"/></label>
          <div className="governance-fields"><label>Evidence type<select value={evidenceType} onChange={e=>setEvidenceType(e.target.value)}><option value="AUDIT_REPORT">Audit report</option><option value="CERTIFICATION">Certification</option><option value="TEST_RESULT">Test result</option><option value="EXERCISE_RESULT">Exercise result</option><option value="POLICY">Policy</option><option value="CONTRACT">Contract</option><option value="DOCUMENT">Document</option><option value="OTHER">Other</option></select></label><label>Reference URL<input type="url" required value={referenceUri} onChange={e=>setReferenceUri(e.target.value)} placeholder="https://…"/></label></div>
          <label>Description (optional)<textarea rows={2} maxLength={10000} value={evidenceDescription} onChange={e=>setEvidenceDescription(e.target.value)}/></label>
          <button className="primary-btn" disabled={busy}><Plus size={15}/>Create evidence reference</button>
        </form>
        <div className="governance-record-list">{evidence.map(item=><div className="governance-record" key={item.id}><div><strong>{item.title}</strong><small>{item.evidenceType.replaceAll('_',' ')} · {item.createdBy.displayName}</small><a href={item.referenceUri} target="_blank" rel="noreferrer">Open evidence reference</a></div><span className={'governance-status '+item.status.toLowerCase()}>{item.isExpired ? 'EXPIRED' : item.status}</span></div>)}</div>
        <div className="governance-actions"><label>Selected evidence<select value={selectedEvidence} onChange={e=>setSelectedEvidence(e.target.value)}><option value="">Choose evidence</option>{evidence.map(item=><option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label>
          <div className="governance-button-row"><button disabled={busy||!selectedEvidence||evidence.find(x=>x.id===selectedEvidence)?.status!=='DRAFT'} onClick={()=>action('/governance/evidence/'+selectedEvidence+'/submit')}>Submit for review</button><button disabled={busy||!selectedEvidence||evidence.find(x=>x.id===selectedEvidence)?.status!=='SUBMITTED'} onClick={()=>action('/governance/evidence/'+selectedEvidence+'/review',{decision:'VERIFIED',rationale:'Evidence reference and provenance reviewed by an independent reviewer.'})}>Verify evidence</button></div>
        </div>
      </section>
      <section className="panel governance-panel">
        <div className="panel-heading"><div><h3>Policy & framework register</h3><p>Map organizational policy controls to verified evidence</p></div><ShieldCheck size={18}/></div>
        <form className="governance-form" onSubmit={createPolicy}>
          <label>Policy / control name<input required minLength={3} maxLength={180} value={policyName} onChange={e=>setPolicyName(e.target.value)} placeholder="Access control assurance"/></label>
          <div className="governance-fields"><label>Framework<input required value={framework} onChange={e=>setFramework(e.target.value)} maxLength={100}/></label><label>Control reference<input required value={controlReference} onChange={e=>setControlReference(e.target.value)} maxLength={120} placeholder="8.4.2"/></label></div>
          <label>Requirement description<textarea required minLength={20} maxLength={10000} rows={2} value={policyDescription} onChange={e=>setPolicyDescription(e.target.value)} placeholder="Describe the requirement and intended outcome"/></label>
          <button className="primary-btn" disabled={busy}><Plus size={15}/>Create policy record</button>
        </form>
        <div className="governance-record-list">{policies.map(item=><div className="governance-record" key={item.id}><div><strong>{item.name}</strong><small>{item.framework} · {item.controlReference} · {item.evidenceLinks.length} evidence links</small></div><span className={'governance-status '+item.status.toLowerCase()}>{item.status}</span></div>)}</div>
        <div className="governance-actions"><label>Selected policy<select value={selectedPolicy} onChange={e=>setSelectedPolicy(e.target.value)}><option value="">Choose policy</option>{policies.map(item=><option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
          <div className="governance-button-row"><button disabled={busy||!selectedPolicy||policies.find(x=>x.id===selectedPolicy)?.status!=='DRAFT'} onClick={()=>action('/governance/policies/'+selectedPolicy+'/submit')}>Submit policy</button><button disabled={busy||!selectedPolicy||policies.find(x=>x.id===selectedPolicy)?.status!=='IN_REVIEW'} onClick={()=>action('/governance/policies/'+selectedPolicy+'/approve',{rationale:'Independent policy and control mapping review completed.'})}>Approve policy</button></div>
          <label>Link verified evidence<select disabled={!selectedPolicy} value="" onChange={e=>{if(e.target.value) action('/governance/policies/'+selectedPolicy+'/evidence',{evidenceId:e.target.value});}}><option value="">Select verified evidence</option>{evidence.filter(item=>item.status==='VERIFIED'&&!item.isExpired).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        </div>
      </section>
    </div>
    <section className="panel governance-audit">
      <div className="panel-heading"><div><h3>Governance audit history</h3><p>Latest tenant-scoped events · sensitive metadata fields are redacted by the API</p></div><button className="icon-btn" aria-label="Refresh governance records" onClick={()=>refresh().catch(e=>setError(e.message))}><RefreshCw size={16}/></button></div>
      <div className="table-wrap"><table><thead><tr><th>EVENT</th><th>ACTOR</th><th>TARGET</th><th>TIME (UTC)</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td><strong>{event.action}</strong></td><td>{event.actor?.displayName??'System'}</td><td>{event.targetType??'—'} {event.targetId?.slice(0,8)??''}</td><td>{new Date(event.occurredAt).toLocaleString()}</td></tr>)}</tbody></table></div>
      {!events.length&&<div className="empty-state">No audit events are available to this role.</div>}
    </section>
  </div>;
}
