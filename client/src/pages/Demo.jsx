import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Sigma, Gauge, Award, Ticket, ArrowRight, FlaskConical, RotateCcw, Code2, ShieldCheck } from 'lucide-react';
import { Hero, SectionHead, Skeleton, PageError, Notice } from '../components/ui.jsx';
import { ChartFrame, FeatureEffects, PopulationHistogram, AccuracyScatter, NeighborhoodNeed, IncomeSpectrum, TierLegend, Swatch, DataTable, LOWER, RAISE } from '../components/charts.jsx';
import { api, useApi } from '../lib/api.js';
import { MomentLab } from '../components/Moments.jsx';
import { useSession, useToast } from '../lib/session.jsx';
import { money, money2, pts, pct, ordinal, featureValue, shortDate } from '../lib/format.js';

function Compare({ rows, activeHhid, onPick, busy }) {
  const R = (label, fn) => ({ label, fn });
  const lines = [
    R('Benefit tier', (r) => r.tier.name),
    R('Income percentile', (r) => ordinal(r.percentile)),
    R('Rewards multiplier', (r) => `${r.tier.multiplier}×`),
    R('Everyday essentials', (r) => `${r.everydayRate}% back`),
    R('Greenleaf grocery offer', (r) => (r.sampleOffer ? `${r.sampleOffer.base} → ${r.sampleOffer.boosted}` : '—')),
    R('Site experience', (r) => r.experience.label),
    R('Home leads with', (r) => r.experience.homeLead),
    R('Suggested use of points', (r) => r.experience.pointsUse),
    R('Points balance', (r) => pts(r.points)),
    R('Neighbor gifts received', (r) => (r.neighborGifts.count ? `${pts(r.neighborGifts.points)} pts` : '—')),
  ];
  return (
    <div className="table-wrap">
      <table className="data-table compare">
        <thead>
          <tr>
            <th scope="col" />
            {rows.map((r) => (
              <th key={r.hhid} scope="col" className={r.hhid === activeHhid ? 'active' : ''}>
                <div className="serif" style={{ fontSize: 20, fontWeight: 500 }}>{r.firstName}</div>
                <div className="label" style={{ fontSize: 10 }}>{r.areaName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <th scope="row">{l.label}</th>
              {rows.map((r) => <td key={r.hhid} className={r.hhid === activeHhid ? 'active' : ''}>{l.fn(r)}</td>)}
            </tr>
          ))}
          <tr>
            <th scope="row" />
            {rows.map((r) => (
              <td key={r.hhid} className={r.hhid === activeHhid ? 'active' : ''}>
                {r.hhid === activeHhid ? <span className="badge gold">Viewing</span> : <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onPick(r.hhid)}>View as {r.firstName}</button>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Pipeline({ p }) {
  const steps = [
    { icon: Database, label: 'FIS core', value: `${p.accounts.length} accounts`, sub: `${p.window.transactions} transactions in ${p.window.days} days` },
    { icon: Sigma, label: 'Features', value: `${p.features.filter((f) => f.used).length} signals`, sub: 'deposits, spend mix, balances, cash, fees' },
    { icon: Gauge, label: 'Ridge model', value: money(p.estimatedIncome), sub: `estimated household income (avg ${money(p.baselineIncome)})` },
    { icon: Award, label: 'Benefit tier', value: `${p.tier.name} · ${p.tier.multiplier}×`, sub: `${ordinal(p.percentile)} percentile` },
    { icon: Ticket, label: 'Experience', value: p.experience.label, sub: `${p.offers.shown} needs offers, everyday ${p.offers.everydayRate}% back` },
  ];
  return (
    <div className="pipeline">
      {steps.map((s, i) => (
        <div key={s.label} className="pipeline-step">
          <div className="row gap-2"><div className="list-icon gold"><s.icon /></div><div className="label">{s.label}</div></div>
          <div className="serif mt-2" style={{ fontSize: 22, lineHeight: 1.15 }}>{s.value}</div>
          <div className="small muted mt-1">{s.sub}</div>
          {i < steps.length - 1 && <ArrowRight className="pipeline-arrow" />}
        </div>
      ))}
    </div>
  );
}

function Explorer({ overview }) {
  const toast = useToast();
  const [acct, setAcct] = useState(`${overview.sampleAccounts[0].instNbr}/${overview.sampleAccounts[0].applCde}/${overview.sampleAccounts[0].acctNbr}`);
  const [kind, setKind] = useState('transactions');
  const [raw, setRaw] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const sample = overview.sampleAccounts.find((a) => `${a.instNbr}/${a.applCde}/${a.acctNbr}` === acct);
  const path = kind === 'customer' ? `/customers/${sample.instNbr}/${sample.owner}/accounts` : `/accounts/${acct}${kind === 'transactions' ? '/transactions' : ''}`;
  const groups = [...new Set(overview.sampleAccounts.map((a) => a.group))];
  const run = async () => {
    setBusy(true);
    try { setResult(await api(`/demo/fis?path=${encodeURIComponent(path)}&pageSize=12`)); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const txns = result?.response?.data?.transactions;
  return (
    <div className="card pad">
      <div className="row gap-2"><Code2 size={16} className="gold" /><div className="label gold">FIS API explorer</div></div>
      <p className="small muted mt-2">Send a real request to the simulated core through the Helping Hands adapter and see the raw response.</p>
      <div className="row gap-3 wrap mt-4">
        <select className="select grow" style={{ minWidth: 220 }} value={acct} onChange={(e) => { setAcct(e.target.value); setResult(null); }} aria-label="Account">
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {overview.sampleAccounts.filter((a) => a.group === g).map((a) => <option key={`${a.instNbr}/${a.applCde}/${a.acctNbr}`} value={`${a.instNbr}/${a.applCde}/${a.acctNbr}`}>{a.label}</option>)}
            </optgroup>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => { setKind(e.target.value); setResult(null); }} aria-label="Request">
          <option value="transactions">Transaction history</option>
          <option value="account">Account inquiry</option>
          <option value="customer">Customer accounts</option>
        </select>
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Requesting…' : 'Send request'}</button>
      </div>
      <div className="code-line mt-3">GET /fis/v1{path}</div>
      {result && (
        <div className="mt-4 fade-in">
          <div className="row between">
            <span className="small muted">status <span className="gold num">{result.response.status.statusCode} {result.response.status.statusDesc}</span>{result.response.pagination ? ` · ${result.response.pagination.totalRecs} records` : ''}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setRaw((v) => !v)}>{raw ? 'Formatted' : 'Raw JSON'}</button>
          </div>
          {raw || !txns ? (
            <pre className="json mt-2">{JSON.stringify(result.response, null, 2)}</pre>
          ) : (
            <div className="mt-2">
              <DataTable columns={['postDt', 'tranCde', 'description', 'MCC', 'drCr', 'tranAmt', 'runBal']}
                rows={txns.map((t) => [t.postDt, t.tranCde, t.mrchNme || t.tranDesc, t.mrchCatCde || t.payeeCatCde || '—', t.drCrCde, money2(t.tranAmt), money2(t.runBal)])} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DemoConsole({ onChange }) {
  const toast = useToast();
  const { refreshMe, signOut } = useSession();
  const navigate = useNavigate();
  const accounts = useApi('/me/accounts');
  const { data } = useApi('/sandbox/merchants');
  const [form, setForm] = useState({ linkId: '', partnerId: '', amount: '48.20' });
  const [busy, setBusy] = useState(false);
  const list = accounts.data?.accounts || [];
  const linkId = form.linkId || list.find((a) => a.applCde === 'DD')?.id;
  const partnerId = form.partnerId || data?.merchants.find((m) => m.needs)?.id;
  const purchase = async () => {
    setBusy(true);
    try {
      const r = await api('/sandbox/purchase', { method: 'POST', body: { linkId, partnerId, amount: Number(form.amount) } });
      const gained = (r.sync.everyday?.points || 0) + r.sync.redemptions.reduce((a, x) => a + x.points, 0);
      toast.push({ title: `Posted to FIS · ${r.account}`, body: `${r.transaction.tranDesc} ${money2(r.transaction.tranAmt)} · seq ${r.transaction.seqNbr}${gained ? ` · +${pts(gained)} pts` : ' · no rewards (not an essential, or no active offer)'}`, duration: 6500 });
      await Promise.all([onChange?.(), refreshMe(), accounts.reload({ quiet: true })]);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!window.confirm('Reset all demo activity (points, offers, gifts and FIS postings)?')) return;
    await api('/admin/reset', { method: 'POST' });
    signOut();
    navigate('/welcome');
  };
  return (
    <div className="card pad">
      <div className="row gap-2"><FlaskConical size={16} className="gold" /><div className="label gold">Demo console</div></div>
      <p className="small muted mt-2">Post a card purchase into the simulated FIS core as a memo post, then watch rewards match in real time.</p>
      <div className="stack gap-3 mt-4">
        <div className="field">
          <label htmlFor="sb-acct">Pay from</label>
          <select id="sb-acct" className="select" value={linkId || ''} onChange={(e) => setForm((f) => ({ ...f, linkId: e.target.value }))}>
            {list.map((a) => <option key={a.id} value={a.id}>{a.institution} · {a.type} {a.masked}</option>)}
          </select>
        </div>
        <div className="row gap-3">
          <div className="field grow">
            <label htmlFor="sb-mrch">Merchant</label>
            <select id="sb-mrch" className="select" value={partnerId || ''} onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value }))}>
              {data?.merchants.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.category}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label htmlFor="sb-amt">Amount</label>
            <input id="sb-amt" className="input num" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
        </div>
      </div>
      <div className="row gap-3 wrap mt-4">
        <button className="btn btn-primary" disabled={busy || !linkId || !partnerId} onClick={purchase}>{busy ? 'Posting…' : 'Simulate purchase'}</button>
        <button className="btn btn-ghost" onClick={reset}><RotateCcw />Reset demo</button>
      </div>
    </div>
  );
}

export default function Demo() {
  const { me, signIn } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const compare = useApi('/demo/compare');
  const pipeline = useApi(`/demo/pipeline?hhid=${me.hhid}`);
  const population = useApi('/demo/population');
  const overview = useApi('/demo/overview');
  const neighbors = useApi('/neighbors');
  const [switching, setSwitching] = useState(false);

  const pick = async (hhid) => {
    if (hhid === me.hhid) return;
    setSwitching(true);
    try {
      const r = await signIn(hhid);
      toast.push({ title: `Now viewing as ${r.me.firstName}`, body: `${r.me.tier.name} tier · ${r.me.experience.label}. The whole site has switched.` });
      compare.reload({ quiet: true });
      neighbors.reload({ quiet: true });
    } catch (e) { toast.error(e); } finally { setSwitching(false); }
  };

  if (compare.error && !compare.data) return <PageError error={compare.error} onRetry={compare.reload} />;
  const p = pipeline.data;
  const pop = population.data;
  const o = overview.data;
  const hoods = neighbors.data?.areas.filter((a) => a.type === 'neighborhood');

  return (
    <div className="page">
      <Hero compact image="hero-demo" label="Demo · Jacksonville, FL" title={<>Under the <span className="italic">hood.</span></>}
        sub="A simulated FIS core, a synthetic Jacksonville population, real local charities, and the models that predict when a reward matters and turn spending patterns into a benefit tier.">
        {o && (
          <div className="hero-stats">
            <div className="hero-stat"><div className="label">Households in the core</div><div className="value num">{pts(o.totals.simulatedHouseholds + o.totals.personas)}</div><div className="sub">{o.market.neighborhoods} neighborhoods</div></div>
            <div className="hero-stat"><div className="label">Transactions</div><div className="value num">{pts(o.totals.transactions)}</div><div className="sub">{shortDate(o.dateRange.from)} – {shortDate(o.dateRange.to)}</div></div>
            <div className="hero-stat"><div className="label">Real charities</div><div className="value num">{o.totals.charities}</div><div className="sub">pulled from IRS data</div></div>
          </div>
        )}
      </Hero>

      <div className="container">
        <section className="section">
          <SectionHead label="Switch member" title="One site, five incomes" />
          <div className="card pad">
            {compare.data ? (
              <IncomeSpectrum personas={compare.data.rows.map((r) => ({ hhid: r.hhid, firstName: r.firstName, lastName: r.name.split(' ')[1], percentile: r.percentile }))} activeHhid={me.hhid} onPick={pick} busy={switching} />
            ) : <Skeleton height={150} />}
            <p className="small muted mt-4">Pick a member to view the whole site as them. Lower-income households get a savings-first experience with the biggest boosts; higher-income households see a giving-first site that points their rewards toward neighbors who need them.</p>
          </div>
          <div className="mt-5">{compare.data ? <Compare rows={compare.data.rows} activeHhid={me.hhid} onPick={pick} busy={switching} /> : <Skeleton height={380} />}</div>
          <div className="row gap-3 wrap mt-4">
            <button className="btn btn-primary" onClick={() => navigate('/')}>Open {me.firstName}’s home <ArrowRight /></button>
            <button className="btn btn-secondary" onClick={() => navigate('/give')}>See {me.firstName}’s giving</button>
          </div>
        </section>

        <section className="section">
          {/* Intent model heatmap + nudge simulator + model scores (components/Moments.jsx). */}
          <SectionHead label="Moment of intent" title={`When and where ${me.firstName} will shop`} />
          <MomentLab />
        </section>

        <section className="section">
          <SectionHead label="Income model" title={`How the model reads ${me.firstName}`} />
          {p ? <Pipeline p={p} /> : <Skeleton height={140} />}
          <div className="split mt-5">
            {p ? (
              <ChartFrame label="Why this estimate" title="What moves the estimate"
                subtitle={`Each bar is how much one spending signal moves ${me.firstName}'s estimate away from an average household (${money(p.baselineIncome)}).`}
                legend={<><Swatch color={LOWER} label="Lowers the estimate (bigger boost)" /><Swatch color={RAISE} label="Raises the estimate" /></>}
                table={{ columns: ['Signal', 'Value', 'vs. average', 'Effect'], rows: p.features.filter((f) => f.used).map((f) => [f.label, featureValue(f), `${f.z > 0 ? '+' : ''}${f.z} SD`, `${f.effectPct > 0 ? '+' : ''}${f.effectPct}%`]) }}>
                <FeatureEffects features={p.features} formatValue={featureValue} />
              </ChartFrame>
            ) : <Skeleton height={420} />}
            {p ? (
              <div className="card pad">
                <div className="label gold">What the model sees</div>
                <h3 className="card-title mt-1">90 days across {p.accounts.length} linked accounts</h3>
                <div className="list mt-3">
                  {p.accounts.map((a) => (
                    <div key={a.masked} className="list-item">
                      <div className="grow"><div className="small">{a.institution}</div><div className="small muted">{a.type} {a.masked}</div></div>
                      <div className="num small muted">{a.transactions} txns</div>
                    </div>
                  ))}
                </div>
                <div className="label mt-5">Spending mix (model input)</div>
                <div className="mt-2">
                  {p.spending.map((c) => (
                    <div key={c.category} className="row between small" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{c.label} <span className="muted">· need weight {c.needWeight}</span></span>
                      <span className="num muted">{pct(c.share)}</span>
                    </div>
                  ))}
                </div>
                <div className="label mt-5">Top offers chosen</div>
                <div className="mt-2">
                  {p.offers.top.map((t) => (
                    <div key={t.partner + t.title} className="row between small" style={{ padding: '5px 0' }}>
                      <span>{t.partner}</span><span className="num">{t.base} → <span className="gold">{t.headline}</span></span>
                    </div>
                  ))}
                </div>
                <p className="small muted mt-3">{p.offers.withheld} offers for wants are always withheld.</p>
              </div>
            ) : <Skeleton height={420} />}
          </div>
          <div className="mt-5">
            {pop && p ? (
              <ChartFrame label="Where they land" title="Predicted income across the community"
                subtitle={`${pop.members.length} households scored by the same model. Tier boundaries are population percentiles, so the tier is relative, not a fixed income line.`}
                legend={<TierLegend tiers={pop.tiers} />}
                table={{ columns: ['Tier', 'Percentiles', 'Predicted income', 'Multiplier'], rows: pop.tiers.map((t) => [t.name, `${t.fromPct}–${t.toPct}`, `${t.fromIncome ? money(t.fromIncome) : 'under'} – ${t.toIncome ? money(t.toIncome) : 'and up'}`, `${t.multiplier}×`]) }}>
                <PopulationHistogram members={pop.members} tiers={pop.tiers} marker={{ value: p.estimatedIncome, label: `${me.firstName} · ${money(p.estimatedIncome)}` }} />
              </ChartFrame>
            ) : <Skeleton height={300} />}
          </div>
        </section>

        <section className="section">
          <SectionHead label="Synthetic population" title={`${o?.market.name || 'Jacksonville'}, household by household`} />
          <div className="split even">
            {pop ? (
              <ChartFrame label="Model accuracy" title="Actual vs. predicted income"
                subtitle={`Holdout R² ${pop.metrics.r2} on synthetic training data; ${pct(pop.metrics.tierWithinOne)} of predictions land within one tier.`}
                legend={<><Swatch color="#9299A3" label="Synthetic household" round /><Swatch color="#D6B178" label="Demo member" round /></>}
                table={{ columns: ['Household', 'Area', 'Actual', 'Predicted', 'Tier'], rows: pop.members.filter((m) => m.persona).concat(pop.members.filter((m) => !m.persona).slice(0, 30)).map((m) => [m.name || 'Synthetic household', m.areaName, money(m.trueIncome), money(m.predicted), m.tier]) }}>
                <AccuracyScatter members={pop.members} />
              </ChartFrame>
            ) : <Skeleton height={480} />}
            {hoods && pop ? (
              <ChartFrame label="Model-detected need" title="Households by tier, by neighborhood"
                subtitle={`Sorted by lower-income share. Donors can fund a group only if it has at least ${neighbors.data.kMin} households, so no gift can single anyone out.`}
                legend={<TierLegend tiers={pop.tiers} />}
                table={{ columns: ['Neighborhood', 'Households', 'Lower-income', 'Share', 'Fund'], rows: hoods.map((a) => [a.name, a.households, a.lower, pct(a.needIndex), a.targetable.lower ? 'Open' : 'Protected']) }}>
                <NeighborhoodNeed areas={hoods} tiers={pop.tiers} kMin={neighbors.data.kMin} />
              </ChartFrame>
            ) : <Skeleton height={480} />}
          </div>
          <div className="mt-4"><Notice icon={ShieldCheck}>Neighborhood income levels are illustrative inputs to the synthetic population, not census data. In production, tiers would be opt-in and donors would only ever see aggregate groups.</Notice></div>
        </section>

        <section className="section">
          <SectionHead label="Sample database" title="Inside the simulated FIS core" />
          {o ? (
            <div className="split">
              <div className="stack gap-5">
                <div className="card pad">
                  <div className="grid-3" style={{ gap: 'var(--s4)' }}>
                    {[['Institutions', o.totals.institutions], ['Customers', o.totals.customers], ['Accounts', o.totals.accounts], ['Transactions', o.totals.transactions], ['Partners', o.totals.partners], ['Real charities', o.totals.charities]].map(([k, v]) => (
                      <div key={k} className="stat"><div className="label">{k}</div><div className="value num">{pts(v)}</div></div>
                    ))}
                  </div>
                  <hr className="divider" />
                  <DataTable columns={['Institution', 'RTN', 'Customers', 'Accounts', 'Transactions']}
                    rows={o.institutions.map((i) => [i.name, i.rtnNbr, pts(i.customers), pts(i.accounts), pts(i.transactions)])} />
                  <p className="small muted mt-3">Institutions, people and routing numbers are fictional (routing numbers carry valid ABA check digits). Charities are real; their settlement accounts here are simulated.</p>
                </div>
                <ChartFrame label="Transaction mix" title="What the core holds"
                  table={{ columns: ['Code', 'Type', 'Count'], rows: o.tranCodes.map((t) => [t.code, t.label, pts(t.count)]) }}>
                  <div className="stack gap-2">
                    {o.tranCodes.map((t) => (
                      <div key={t.code} className="bar-row">
                        <span className="truncate"><span className="num gold" style={{ marginRight: 8 }}>{t.code}</span>{t.label}</span>
                        <div className="bar"><span className="need" style={{ width: `${(t.count / o.tranCodes[0].count) * 100}%` }} /></div>
                        <span className="num small muted" style={{ textAlign: 'right' }}>{pts(t.count)}</span>
                      </div>
                    ))}
                  </div>
                </ChartFrame>
              </div>
              <div className="stack gap-5">
                <Explorer overview={o} />
                <DemoConsole onChange={() => { compare.reload({ quiet: true }); pipeline.reload({ quiet: true }); }} />
              </div>
            </div>
          ) : <Skeleton height={420} />}
        </section>
      </div>
    </div>
  );
}
