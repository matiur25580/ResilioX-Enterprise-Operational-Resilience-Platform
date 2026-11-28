import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Bell, Boxes, Building2,
  CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, FileCheck2,
  GitBranch, LayoutDashboard, LockKeyhole, LogOut, Menu, Network, Search,
  ShieldAlert, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from 'recharts';
import { api, restoreSession } from './api';
import type { Overview, Tenant, User } from './types';
import { BiaPage } from './BiaPage';
import { DependencyPage } from './DependencyPage';
import { RiskPage } from './RiskPage';
import { ContinuityPage } from './ContinuityPage';
import { IncidentPage } from './IncidentPage';
import { SupplierPage } from './SupplierPage';

type Session = { token: string; user: User; tenant: Tenant };
const navItems = [
  { label: 'Command center', icon: LayoutDashboard, active: true },
  { label: 'Business services', icon: Building2, planned: true },
  { label: 'Dependencies', icon: Network, planned: false },
  { label: 'Risk & controls', icon: ShieldAlert, planned: false },
  { label: 'Impact analysis', icon: Activity, planned: false },
  { label: 'Continuity plans', icon: ClipboardCheck, planned: false },
  { label: 'Incidents', icon: ShieldAlert, planned: false },
  { label: 'Suppliers', icon: Boxes, planned: false },
  { label: 'Governance', icon: FileCheck2, planned: true },
];

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, organizationSlug }),
      });
      const identity = await api<{ user: User; tenant: Tenant }>('/auth/me', {}, result.accessToken);
      onLogin({ token: result.accessToken, ...identity });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally { setBusy(false); }
  }
  return <main className="login-screen">
    <div className="login-art">
      <div className="brand"><span className="brand-mark"><ShieldCheck size={20}/></span><span>continuity<span className="brand-light">grid</span></span></div>
      <div className="login-message">
        <div className="eyebrow"><span className="live-dot"/> OPERATIONAL RESILIENCE INTELLIGENCE</div>
        <h1>Know what matters.<br/><em>Recover with confidence.</em></h1>
        <p>Connect critical services, understand dependencies and coordinate your resilience posture from one command center.</p>
        <div className="login-proof"><div><strong>01</strong><span>Understand exposure</span></div><div><strong>02</strong><span>Prioritize recovery</span></div><div><strong>03</strong><span>Prove readiness</span></div></div>
      </div>
      <div className="login-foot">CONTINUITYGRID <span>·</span> ENTERPRISE RESILIENCE PLATFORM</div>
    </div>
    <section className="login-panel">
      <div className="login-card">
        <div className="mobile-brand brand"><span className="brand-mark"><ShieldCheck size={20}/></span><span>continuity<span className="brand-light">grid</span></span></div>
        <div className="eyebrow muted">SECURE WORKSPACE</div>
        <h2>Welcome back</h2>
        <p className="subtle">Sign in to your organization's resilience workspace.</p>
        <form onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/></label>
          <label>Organization workspace<input required value={organizationSlug} onChange={e=>setOrganizationSlug(e.target.value)} placeholder="your-organization"/></label>
          {error && <div className="form-error"><AlertCircle size={16}/>{error}</div>}
          <button className="primary-btn full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'} <ArrowUpRight size={17}/></button>
        </form>
        <div className="login-security"><LockKeyhole size={15}/> Protected with encrypted sessions and tenant-scoped access</div>
      </div>
      <div className="login-bottom">Need access? Contact your workspace administrator.</div>
    </section>
  </main>;
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend }: { label: string; value: number; detail: string; icon: typeof Activity; tone: string; trend?: 'up' | 'down' }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={18}/></span></div>
    <div className="metric-value">{value.toLocaleString()}</div>
    <div className="metric-detail">{trend === 'up' ? <ArrowUpRight size={13}/> : trend === 'down' ? <ArrowDownRight size={13}/> : <span className="metric-bullet"/>}{detail}</div>
  </article>;
}

function timeAgo(date: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [activePage, setActivePage] = useState('Command center');
  useEffect(() => {
    let active = true;
    api<Overview>('/command-center/overview', {}, session.token)
      .then(data => { if (active) setOverview(data); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load command center.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.token]);
  const filteredServices = useMemo(() => (overview?.services ?? []).filter(service =>
    `${service.name} ${service.ownerName ?? ''} ${service.criticality}`.toLowerCase().includes(query.toLowerCase())
  ), [overview, query]);
  const metrics = overview?.metrics;
  const chartData = overview?.serviceCriticality.map(item => ({ name: item.tier, value: item.count })) ?? [];
  const chartColors: Record<string, string> = { CRITICAL: '#e36b6b', HIGH: '#e6a64e', MEDIUM: '#5f8fe6', LOW: '#4cae91' };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-mark"><ShieldCheck size={19}/></span><span>continuity<span className="brand-light">grid</span></span><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">{session.tenant.role.slice(0,1)}</div><div><strong>{session.user.displayName}</strong><span>{session.tenant.role.replace('_',' ')}</span></div><ChevronDown size={15}/></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav>{navItems.map(item => <button key={item.label} className={`nav-item ${activePage === item.label ? 'selected' : ''}`} disabled={item.planned} onClick={() => { setActivePage(item.label); setMobileNav(false); }} title={item.planned ? 'Planned for a future milestone' : item.label}><item.icon size={17}/><span>{item.label}</span>{item.planned && <span className="planned-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={17}/><div><strong>Need a hand?</strong><span>Explore the platform guide</span></div></div><div className="profile-row"><div className="profile-avatar">{session.user.displayName.slice(0,1).toUpperCase()}</div><div className="profile-info"><strong>{session.user.displayName}</strong><span>{session.user.email}</span></div><button className="icon-btn" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    {mobileNav && <button className="nav-scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{activePage}</strong></div></div><div className="topbar-actions"><div className="search-box"><Search size={16}/><input aria-label="Search services" placeholder="Search services…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div><button className="icon-btn notification-btn" aria-label="Notifications"><Bell size={18}/><i/></button><div className="topbar-divider"/><div className="tenant-chip"><span className="tenant-dot"/>{session.tenant.role.replace('_',' ')}</div></div></header>
      <div className="page-content">
        {activePage === 'Impact analysis' ? <><div className="page-heading"><div><div className="eyebrow muted">RESILIENCE FOUNDATION <span className="heading-dot"/> MILESTONE 05</div><h1>Business impact analysis</h1><p>Understand disruption impact and establish recovery priorities.</p></div></div><BiaPage token={session.token}/><footer className="page-footer"><span>© 2026 ContinuityGrid · Enterprise operational resilience</span><span>Tenant-scoped workspace <i/> Secure session</span></footer></> : activePage === 'Dependencies' ? <><div className="page-heading"><div><div className="eyebrow muted">RESILIENCE FOUNDATION <span className="heading-dot"/> MILESTONE 06</div><h1>Dependency intelligence</h1><p>Understand connected operational services and verified dependency paths.</p></div></div><DependencyPage token={session.token}/><footer className="page-footer"><span>© 2026 ContinuityGrid · Enterprise operational resilience</span><span>Tenant-scoped workspace <i/> Secure session</span></footer></> : activePage === 'Risk & controls' ? <><div className="page-heading"><div><div className="eyebrow muted">OPERATIONAL GOVERNANCE <span className="heading-dot"/> MILESTONE 07</div><h1>Risk & controls</h1><p>Measure operational exposure and prove control effectiveness.</p></div></div><RiskPage token={session.token}/><footer className="page-footer"><span>© 2026 ContinuityGrid · Enterprise operational resilience</span><span>Tenant-scoped workspace <i/> Secure session</span></footer></> : activePage === 'Continuity plans' ? <><div className="page-heading"><div><div className="eyebrow muted">RESILIENCE EXECUTION <span className="heading-dot"/> MILESTONE 08</div><h1>Business continuity</h1><p>Build, approve, exercise and continuously improve recovery plans.</p></div></div><ContinuityPage token={session.token}/><footer className="page-footer"><span>© 2026 ContinuityGrid · Enterprise operational resilience</span><span>Tenant-scoped workspace <i/> Secure session</span></footer></> : activePage === 'Suppliers' ? <><div className="page-heading"><div><div className="eyebrow muted">THIRD-PARTY RESILIENCE <span className="heading-dot"/> MILESTONE 11</div><h1>Supplier resilience & assurance</h1><p>Manage supplier exposure, recovery commitments and independent assurance evidence.</p></div></div><SupplierPage token={session.token}/><footer className="page-footer"><span>© 2026 ContinuityGrid · Enterprise operational resilience</span><span>Tenant-scoped workspace <i/> Secure session</span></footer></> : activePage === 'Incidents' ? <><div className="page-heading"><div><div className="eyebrow muted">RESILIENCE EXECUTION <span className="heading-dot"/> MILESTONE 09</div><h1>Incident & crisis management</h1><p>Lead the response with governed severity, accountable actions and an auditable timeline.</p></div></div><IncidentPage token={session.token}/><footer className="page-footer"><span>© 2026 ContinuityGrid · Enterprise operational resilience</span><span>Tenant-scoped workspace <i/> Secure session</span></footer></> : <>
        <div className="page-heading"><div><div className="eyebrow muted">RESILIENCE OVERVIEW <span className="heading-dot"/> LIVE WORKSPACE DATA</div><h1>Good to see you, {session.user.displayName.split(' ')[0]}.</h1><p>Here's the current resilience picture across your organization.</p></div><div className="heading-actions"><span className="updated-label"><span className="live-dot"/> Live data</span><button className="secondary-btn" onClick={()=>window.location.reload()}>Refresh data</button></div></div>
        {error && <div className="notice error-notice"><AlertCircle size={17}/>{error}</div>}
        {loading ? <div className="loading-grid">{Array.from({length:4},(_,i)=><div className="skeleton" key={i}/>)}</div> : overview && metrics && <>
          <div className="metrics-grid">
            <MetricCard label="Business services" value={metrics.services} detail={`${metrics.activeServices} active services`} icon={Building2} tone="blue"/>
            <MetricCard label="Critical services" value={metrics.criticalServices} detail="Require prioritized recovery" icon={ShieldAlert} tone="rose"/>
            <MetricCard label="Dependencies mapped" value={metrics.dependencies} detail={`${metrics.verifiedDependencies} verified relationships`} icon={GitBranch} tone="violet"/>
            <MetricCard label="Technology footprint" value={metrics.applications + metrics.technologyAssets} detail={`${metrics.applications} applications · ${metrics.technologyAssets} assets`} icon={Boxes} tone="teal"/>
          </div>
          <div className="content-grid">
            <section className="panel service-panel"><div className="panel-heading"><div><h3>Business service portfolio</h3><p>Latest service records in your tenant</p></div><span className="panel-count">{metrics.services} total</span></div>
              {filteredServices.length ? <div className="table-wrap"><table><thead><tr><th>SERVICE</th><th>OWNER</th><th>CRITICALITY</th><th>STATUS</th></tr></thead><tbody>{filteredServices.map(service=><tr key={service.id}><td><div className="service-name"><span className="service-symbol"><Building2 size={15}/></span><strong>{service.name}</strong></div></td><td>{service.ownerName || 'Unassigned'}</td><td><span className={`tier tier-${service.criticality.toLowerCase()}`}>{service.criticality}</span></td><td><span className={`status status-${service.status.toLowerCase()}`}>{service.status.replace('_',' ')}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><Building2 size={22}/></div><strong>{query ? 'No matching services' : 'Your service portfolio starts here'}</strong><p>{query ? 'Try a different search term.' : 'Business services added to this workspace will appear here. This view reads directly from your tenant database.'}</p></div>}
            </section>
            <section className="panel criticality-panel"><div className="panel-heading"><div><h3>Service criticality</h3><p>Portfolio distribution</p></div><span className="mini-icon"><Sparkles size={16}/></span></div>
              {chartData.length ? <><div className="donut-wrap"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={chartData} dataKey="value" nameKey="name" innerRadius={57} outerRadius={78} paddingAngle={3} stroke="none">{chartData.map(item=><Cell key={item.name} fill={chartColors[item.name] || '#8795a8'}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{metrics.services}</strong><span>services</span></div></div><div className="legend">{['CRITICAL','HIGH','MEDIUM','LOW'].map(tier=><div key={tier}><span style={{background:chartColors[tier]}}/>{tier}<strong>{chartData.find(x=>x.name===tier)?.value ?? 0}</strong></div>)}</div></> : <div className="chart-empty"><Network size={24}/><strong>No criticality data yet</strong><span>Service records will populate this chart.</span></div>}
            </section>
          </div>
          <div className="bottom-grid">
            <section className="panel footprint-panel"><div className="panel-heading"><div><h3>Resilience inventory</h3><p>Connected operational records</p></div><span className="mini-icon"><Boxes size={16}/></span></div><div className="inventory-grid"><div><span>Processes</span><strong>{metrics.processes}</strong></div><div><span>Applications</span><strong>{metrics.applications}</strong></div><div><span>Technology assets</span><strong>{metrics.technologyAssets}</strong></div><div><span>Suppliers</span><strong>{metrics.suppliers}</strong></div><div><span>Dependencies</span><strong>{metrics.dependencies}</strong></div><div><span>Needs review</span><strong className={metrics.dependenciesNeedingReview ? 'warning-value' : ''}>{metrics.dependenciesNeedingReview}</strong></div></div></section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Security and workspace audit trail</p></div><Activity size={17} className="activity-heading-icon"/></div>{overview.recentActivity.length ? <div className="activity-list">{overview.recentActivity.map(item=><div className="activity-item" key={item.id}><span className="activity-icon"><CheckCircle2 size={15}/></span><div><strong>{item.action.replaceAll('.',' ')}</strong><span>{item.actorName} · {item.targetType || 'workspace'}</span></div><time>{timeAgo(item.occurredAt)}</time></div>)}</div> : <div className="activity-empty"><CheckCircle2 size={20}/><span>No activity recorded yet. Important workspace actions will appear here.</span></div>}</section>
          </div>
          <div className="capability-note"><div><Sparkles size={17}/><span><strong>Platform capabilities are being rolled out progressively.</strong> Planned modules are clearly marked and will become available as their milestones ship.</span></div><span className="release-label">MILESTONE 05</span></div>
        </>}
        {!loading && !overview && !error && <div className="notice">No overview data is available yet.</div>}
        <footer className="page-footer"><span>© 2026 ContinuityGrid · Enterprise operational resilience</span><span>Tenant-scoped workspace <i/> Secure session</span></footer>
        </>}
      </div>
    </main>
  </div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    restoreSession().then(value => {
      if (value) setSession(value);
    }).finally(() => setChecking(false));
  }, []);
  async function logout() {
    try { await api<void>('/auth/logout', { method: 'POST' }); } finally { setSession(null); }
  }
  if (checking) return <div className="boot-screen"><span className="brand-mark"><ShieldCheck size={20}/></span><span>Loading secure workspace…</span></div>;
  return session ? <Dashboard session={session} onLogout={logout}/> : <Login onLogin={setSession}/>;
}
