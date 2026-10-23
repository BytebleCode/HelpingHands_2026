import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ShieldCheck, Landmark, Check, Clock3 } from 'lucide-react';
import { Hero, SectionHead, Modal, PageLoading, PageError, Notice } from '../components/ui.jsx';
import { OfferCard, OfferModal, useOfferActions } from '../components/Offers.jsx';
import { api, useApi } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { pts, money2, shortDate, plural } from '../lib/format.js';

function CashOutModal({ open, onClose, balance, onDone }) {
  const toast = useToast();
  const { data } = useApi('/me/accounts');
  const checking = data?.accounts?.filter((a) => a.applCde === 'DD') || [];
  const [linkId, setLinkId] = useState('');
  const [amount, setAmount] = useState(Math.min(balance, 1000));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const max = Math.floor(balance / 100) * 100;
  const chosen = linkId || checking[0]?.id;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api('/rewards/cashout', { method: 'POST', body: { points: amount, linkId: chosen } });
      setResult(r);
      onDone?.();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const close = () => { setResult(null); onClose(); };

  return (
    <Modal open={open} onClose={close} label="Statement credit" title={result ? 'Credit on its way' : 'Cash out rewards'}>
      {result ? (
        <div className="stack gap-4 fade-in">
          <div className="success-mark"><Check /></div>
          <p>{money2(result.transfer.tranAmt)} was posted to your account as a statement credit.</p>
          <div>
            <div className="kv"><span>FIS reference</span><span className="num">{result.transfer.tranRefNbr}</span></div>
            <div className="kv"><span>Routing</span><span className="num">{result.transfer.fromAcct.rtnNbr} → {result.transfer.toAcct.rtnNbr}</span></div>
            <div className="kv"><span>Remaining balance</span><span className="num">{pts(result.balance)} pts</span></div>
          </div>
          <button className="btn btn-primary" onClick={close}>Done</button>
        </div>
      ) : max < 500 ? (
        <p className="muted">You need at least 500 points ($5) to cash out. You have {pts(balance)}.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="co-acct">Deposit to</label>
            <select id="co-acct" className="select" value={chosen || ''} onChange={(e) => setLinkId(e.target.value)}>
              {checking.map((a) => <option key={a.id} value={a.id}>{a.institution} · {a.type} {a.masked}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="co-amt">Amount · <span className="num">{pts(amount)} pts = {money2(amount / 100)}</span></label>
            <input id="co-amt" className="range" type="range" min={500} max={max} step={100} value={Math.min(Math.max(amount, 500), max)} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <Notice icon={Landmark}>Funded from the Helping Hands rewards pool and posted to your account in real time through the FIS core as a memo-posted credit.</Notice>
          <button className="btn btn-primary" disabled={busy || !chosen} onClick={submit}>{busy ? 'Posting…' : `Credit ${money2(Math.min(Math.max(amount, 500), max) / 100)}`}</button>
        </>
      )}
    </Modal>
  );
}

export default function Rewards() {
  const { me, refreshMe } = useSession();
  const toast = useToast();
  const [category, setCategory] = useState('');
  const { data, error, loading, reload } = useApi('/rewards');
  const { activate, busy } = useOfferActions(() => reload({ quiet: true }));
  const [selectedId, setSelectedId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError error={error} onRetry={reload} />;

  const offers = category ? data.offers.filter((o) => o.category === category) : data.offers;
  const wallet = data.offers.filter((o) => o.status !== 'available');
  const selected = data.offers.find((o) => o.id === selectedId);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api('/rewards/sync', { method: 'POST' });
      const gained = (r.everyday?.points || 0) + r.redemptions.reduce((a, x) => a + x.points, 0);
      toast.push(gained
        ? { title: `+${pts(gained)} points`, body: [r.everyday?.desc, ...r.redemptions.map((x) => `${x.partner}: ${money2(x.tranAmt)}`)].filter(Boolean).join(' · ') }
        : { title: 'You’re up to date', body: 'No new qualifying purchases on your linked accounts.' });
      await Promise.all([reload({ quiet: true }), refreshMe()]);
    } catch (e) { toast.error(e); } finally { setSyncing(false); }
  };

  return (
    <div className="page">
      <Hero
        image="hero-rewards"
        label="Needs, not wants"
        title={<>Rewards for the<br /><span className="italic">essentials.</span></>}
        sub={`Picked from your purchases across ${plural(me.linkedAccounts, 'linked account')}. Your ${data.tier.name} tier multiplies every offer by ${data.multiplier}×.`}
      >
        <div className="hero-stats">
          <div className="hero-stat"><div className="label">Balance</div><div className="value num">{pts(data.points)}</div><div className="sub">{money2(data.points / 100)}</div></div>
          <div className="hero-stat"><div className="label">Your boost</div><div className="value">{data.multiplier}×</div><div className="sub">{data.tier.name} tier</div></div>
          <div className="hero-stat"><div className="label">In your wallet</div><div className="value num">{wallet.length}</div><div className="sub">active or redeemed</div></div>
        </div>
      </Hero>

      <div className="container">
        {me.experience?.key === 'give' && (
          <section className="section">
            <div className="card pad gold-edge mode-banner">
              <div className="grow">
                <div className="label gold">Giving first</div>
                <div className="serif mt-1" style={{ fontSize: 26 }}>Your {pts(data.points)} points could reach households that need them more.</div>
                <p className="small muted mt-1">At {data.tier.name} your offers pay {data.multiplier}×. The same points through a Neighbor Fund go to households the model finds are stretched thin.</p>
              </div>
              <Link to="/give" className="btn btn-primary">Give to neighbors</Link>
            </div>
          </section>
        )}
        <section className="section">
          <SectionHead label={`${data.offers.length} essential offers`} title="Selected for you">
            <button className="btn btn-secondary btn-sm" onClick={sync} disabled={syncing}><RefreshCw className={syncing ? 'spin' : ''} />{syncing ? 'Checking…' : 'Check purchases'}</button>
          </SectionHead>
          <div className="chips" role="tablist" aria-label="Filter by category">
            <button className={`chip ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>All</button>
            {data.categories.map((c) => (
              <button key={c.key} className={`chip ${category === c.key ? 'active' : ''}`} onClick={() => setCategory(c.key)}>{c.label}</button>
            ))}
          </div>
          <div className="grid-3 mt-5">
            {offers.map((o) => <OfferCard key={o.id} offer={o} onOpen={(x) => setSelectedId(x.id)} onActivate={activate} busy={busy} />)}
          </div>
          {data.withheld.count > 0 && (
            <div className="mt-5">
              <Notice icon={ShieldCheck}>
                <strong style={{ fontWeight: 500 }}>{plural(data.withheld.count, 'discretionary offer')} withheld.</strong>{' '}
                <span className="muted">Helping Hands doesn’t promote {data.withheld.categories.map((c) => c.toLowerCase()).join(', ')}. Rewards go to needs.</span>
              </Notice>
            </div>
          )}
        </section>

        <section className="section split">
          <div>
            <SectionHead label="Card-linked" title="Your wallet" />
            <div className="card pad">
              {wallet.length === 0 ? <div className="empty small">Activate an offer and it will appear here. Past purchases count too.</div> : (
                <div className="list">
                  {wallet.map((o) => {
                    const last = o.redemptions?.[o.redemptions.length - 1];
                    return (
                      <button key={o.id} className="list-item as-button" onClick={() => setSelectedId(o.id)}>
                        <div className={`list-icon ${o.status === 'redeemed' ? 'gold' : ''}`}>{o.status === 'redeemed' ? <Check /> : <Clock3 />}</div>
                        <div className="grow">
                          <div className="small">{o.partner.name} · {o.title}</div>
                          <div className="small muted">{o.status === 'redeemed' ? `${last.merchant} ${money2(last.tranAmt)} · ${shortDate(last.postDt)}${last.retroactive ? ' · past purchase' : ''}` : `Watching for ${money2(o.minSpend)}+ at ${o.partner.name}`}</div>
                        </div>
                        <div className={`num ${o.status === 'redeemed' ? 'gold' : 'muted'}`}>{o.status === 'redeemed' ? `+${pts(last.points)}` : o.value.headline}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div>
            <SectionHead label="Use your points" title="Cash out" />
            <div className="card pad stack gap-4">
              <div className="stat"><div className="label">Available</div><div className="value num">{pts(data.points)} pts</div><div className="small muted">{money2(data.points / 100)} · 100 pts = $1</div></div>
              <p className="small muted">Send points to a linked checking account as a statement credit, or give them to a neighbor in need.</p>
              <div className="row gap-3 wrap">
                <button className="btn btn-primary" onClick={() => setCashOpen(true)}>Cash out</button>
                <Link className="btn btn-secondary" to="/give">Donate instead</Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      <OfferModal offer={selected} onClose={() => setSelectedId(null)} onActivate={activate} busy={busy} />
      {cashOpen && <CashOutModal open onClose={() => setCashOpen(false)} balance={data.points} onDone={() => { reload({ quiet: true }); refreshMe(); }} />}
    </div>
  );
}
