import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Plus, ArrowUpRight, ArrowDownRight, Landmark, ShieldCheck, LogOut, Eye, EyeOff, Wand2, FlaskConical } from 'lucide-react';
import { Hero, SectionHead, Modal, PageLoading, PageError, Notice, Skeleton } from '../components/ui.jsx';
import { ActivityList } from './Home.jsx';
import { MomentSettings } from '../components/Nudge.jsx';
import { api, useApi } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { money, money2, pct, ordinal, shortDate, featureValue } from '../lib/format.js';

function Standing({ insights }) {
  const [reveal, setReveal] = useState(false);
  const toast = useToast();
  const e = insights.estimate;
  return (
    <div className="card pad split even" style={{ gap: 'var(--s7)' }}>
      <div>
      <div className="row between wrap gap-3">
        <div className="label gold">Relative income standing</div>
        <span className="badge gold">{e.tier.name} · {e.tier.multiplier}× rewards</span>
      </div>
      <div className="row gap-4 wrap mt-3" style={{ alignItems: 'baseline' }}>
        <span className="serif num" style={{ fontSize: 'clamp(44px, 5vw, 64px)', lineHeight: 1 }}>{ordinal(e.percentile)}</span>
        <span className="muted">percentile among Helping Hands households</span>
      </div>

      <div className="scale">
        <div className="scale-marker" style={{ left: `${Math.min(98, Math.max(2, e.percentile))}%` }}>
          <span className="bubble">You</span>
          <span className="pin" />
        </div>
        <div className="scale-track">{insights.tiers.map((t) => <span key={t.key} className={t.key === e.tier.key ? 'on' : ''} />)}</div>
        <div className="scale-labels">{insights.tiers.map((t) => <div key={t.key} className={t.key === e.tier.key ? 'on' : ''}>{t.name}<br />{t.multiplier}×</div>)}</div>
      </div>

      <p className="small muted mt-4">Estimated from spending patterns across all your linked accounts. Lower standings earn larger multipliers, so the households that need the most get the most back.</p>
      </div>

      <div>
        <div className="label">What shaped this estimate</div>
        <div className="list mt-2">
          {e.drivers.map((d) => (
            <div key={d.key} className="list-item">
              <div className={`list-icon ${d.direction === 'down' ? 'gold' : ''}`}>{d.direction === 'up' ? <ArrowUpRight /> : <ArrowDownRight />}</div>
              <div className="grow">
                <div className="small">{d.label}</div>
                <div className="small muted">{d.direction === 'up' ? 'Raises' : 'Lowers'} the estimate</div>
              </div>
              <div className="num small">{featureValue(d)}</div>
            </div>
          ))}
        </div>

      <div className="row between wrap gap-3 mt-4">
        <button className="btn btn-ghost btn-sm" onClick={() => setReveal((v) => !v)}>{reveal ? <EyeOff /> : <Eye />}{reveal ? `Estimated household income ≈ ${money(e.estimatedAnnualIncome)}` : 'Show estimated income'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => toast.push({ title: 'Review requested', body: 'A member advocate would contact you to review your tier with proof of income.' })}>Request a review</button>
      </div>
      <p className="small muted mt-2" style={{ fontSize: 12 }}>
        Model: ridge regression on {insights.model.features} spending features, trained on {insights.model.n?.toLocaleString()} synthetic households · holdout R² {insights.model.r2} · {pct(insights.model.tierWithinOne)} within one tier. <Link to="/demo" className="gold">See how it works</Link>
      </p>
      </div>
    </div>
  );
}

function LinkModal({ open, onClose, institutions, demo, onLinked }) {
  const toast = useToast();
  const [form, setForm] = useState({ instNbr: '', acctNbr: '', taxIdLast4: '', zipCde: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/me/links', { method: 'POST', body: form });
      setResult(r);
      onLinked?.();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const close = () => { setResult(null); setForm({ instNbr: '', acctNbr: '', taxIdLast4: '', zipCde: '' }); onClose(); };
  const inst = (n) => institutions.find((i) => i.instNbr === n)?.name;

  return (
    <Modal open={open} onClose={close} label="Helping Hands ID" title={result ? 'Account linked' : 'Link an account'}>
      {result ? (
        <div className="stack gap-4 fade-in">
          <p>{inst(result.link.instNbr)} {result.link.masked} is now connected to your Helping Hands ID.</p>
          <div className="card elevated pad" style={{ padding: 'var(--s4)' }}>
            <div className="label">Standing recalculated with the new data</div>
            <div className="row gap-3 mt-2 serif" style={{ fontSize: 24 }}>
              <span className="muted">{ordinal(result.estimate.before.percentile)}</span><span className="muted">→</span><span>{ordinal(result.estimate.after.percentile)} percentile</span>
            </div>
            <div className="small muted mt-1">{result.estimate.after.tier.name} tier · {result.estimate.after.tier.multiplier}× rewards</div>
          </div>
          {result.sync?.everyday && <p className="small gold">{result.sync.everyday.desc} · +{pts(result.sync.everyday.points)} pts</p>}
          <button className="btn btn-primary" onClick={close}>Done</button>
        </div>
      ) : (
        <form className="stack gap-4" onSubmit={submit}>
          <p className="small muted">Any account at an FIS-core partner institution can be linked. The bank verifies ownership before anything connects.</p>
          <div className="field">
            <label htmlFor="inst">Institution</label>
            <select id="inst" className="select" value={form.instNbr} onChange={set('instNbr')} required>
              <option value="">Choose your bank</option>
              {institutions.map((i) => <option key={i.instNbr} value={i.instNbr}>{i.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="acct">Account number</label><input id="acct" className="input num" inputMode="numeric" value={form.acctNbr} onChange={set('acctNbr')} required /></div>
          <div className="grid-2" style={{ gap: 'var(--s4)' }}>
            <div className="field"><label htmlFor="ssn">Last 4 of SSN</label><input id="ssn" className="input num" inputMode="numeric" maxLength={4} value={form.taxIdLast4} onChange={set('taxIdLast4')} required /></div>
            <div className="field"><label htmlFor="zip">ZIP code</label><input id="zip" className="input num" inputMode="numeric" maxLength={5} value={form.zipCde} onChange={set('zipCde')} required /></div>
          </div>
          {demo?.length > 0 && (
            <Notice icon={Wand2}>
              Demo: this member has an unlinked account at {inst(demo[0].instNbr)}.{' '}
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', color: 'var(--gold)' }} onClick={() => setForm({ instNbr: demo[0].instNbr, acctNbr: demo[0].acctNbr, taxIdLast4: demo[0].taxIdLast4, zipCde: demo[0].zipCde })}>Fill in details</button>
            </Notice>
          )}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Verifying with the bank…' : 'Verify & link'}</button>
        </form>
      )}
    </Modal>
  );
}

export default function Account() {
  const { me, refreshMe, signOut } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const accounts = useApi('/me/accounts');
  const insights = useApi('/me/insights');
  const activity = useApi('/me/activity');
  const [linkOpen, setLinkOpen] = useState(false);

  if (accounts.loading && !accounts.data) return <PageLoading />;
  if (accounts.error && !accounts.data) return <PageError error={accounts.error} onRetry={accounts.reload} />;
  const refreshAll = () => Promise.all([accounts.reload({ quiet: true }), insights.reload({ quiet: true }), activity.reload({ quiet: true }), refreshMe()]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(me.hhid); toast.push('Helping Hands ID copied'); } catch { toast.push(me.hhid); }
  };

  return (
    <div className="page">
      <Hero compact image="hero-account" label="Account" title={`${me.firstName} ${me.lastName}`}>
        <div className="row gap-3 wrap mt-4">
          <span className="hhid">{me.hhid}</span>
          <button className="btn btn-secondary btn-sm" onClick={copy}><Copy />Copy ID</button>
        </div>
        <p className="hero-sub" style={{ fontSize: 14 }}>Your Helping Hands ID connects accounts across every FIS-core bank and credit union into one rewards profile.</p>
      </Hero>

      <div className="container">
        <section className="section">
          {insights.data ? <Standing insights={insights.data} /> : <Skeleton height={420} />}
        </section>

        <section className="section">
          <SectionHead label={`${accounts.data.accounts.length} connected · FIS core`} title="Linked accounts">
            <button className="btn btn-primary btn-sm" onClick={() => setLinkOpen(true)}><Plus />Link account</button>
          </SectionHead>
          <div className="grid-3">
            {accounts.data.accounts.map((a) => (
              <div key={a.id} className="card pad stack gap-3">
                <div className="row between">
                  <div className="row gap-3">
                    <div className="list-icon gold"><Landmark /></div>
                    <div>
                      <div className="small" style={{ fontWeight: 500 }}>{a.institution}</div>
                      <div className="small muted">{a.product} {a.masked}</div>
                    </div>
                  </div>
                  <span className="badge">{a.type}</span>
                </div>
                <div>
                  <div className="serif num" style={{ fontSize: 34, lineHeight: 1.1, color: a.curBal < 0 ? 'var(--danger)' : undefined }}>{money2(a.curBal)}</div>
                  <div className="small muted">Available {money2(a.availBal)} · RTN {a.rtnNbr}</div>
                </div>
                <div className="list">
                  {a.recent.slice(0, 4).map((t, i) => (
                    <div key={i} className="row between small" style={{ padding: '6px 0', borderTop: '1px solid var(--border)', gap: 12 }}>
                      <span className="truncate grow">{t.desc}</span>
                      <span className="muted" style={{ flex: 'none' }}>{shortDate(t.postDt)}</span>
                      <span className={`num ${t.amount > 0 ? 'amount-pos' : ''}`} style={{ flex: 'none', minWidth: 72, textAlign: 'right' }}>{t.amount > 0 ? '+' : ''}{money2(t.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4"><Notice icon={ShieldCheck}>Helping Hands reads balances and transactions through the FIS core with your permission, and never sees full credentials. Rewards are paid by FIS transfer.</Notice></div>
        </section>

        {/* Settings the member can change any time (moment nudges can be switched back on here). */}
        <section className="section">
          <SectionHead label="Preferences" title="Nudges and location" />
          <MomentSettings />
        </section>

        <section className="section">
          <SectionHead label="Points ledger" title="Activity">
            <Link to="/demo" className="btn btn-secondary btn-sm"><FlaskConical />Demo tools</Link>
            <button className="btn btn-ghost btn-sm" onClick={() => { signOut(); navigate('/welcome'); }}><LogOut />Sign out</button>
          </SectionHead>
          <div className="card pad">{activity.data ? <ActivityList items={activity.data.ledger.slice(0, 15)} /> : <Skeleton height={240} />}</div>
        </section>
      </div>

      <LinkModal open={linkOpen} onClose={() => setLinkOpen(false)} institutions={accounts.data.institutions} demo={accounts.data.demoUnlinked} onLinked={refreshAll} />
    </div>
  );
}
