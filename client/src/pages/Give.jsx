import { useMemo, useState } from 'react';
import { Gift, HandHelping, Users, Compass, CalendarCheck, Sparkles, Award, Clock, Flame, MapPin, Landmark, HeartHandshake, ExternalLink, Home as HomeIcon, ShieldCheck } from 'lucide-react';
import { Hero, SectionHead, Progress, Img, Modal, PageLoading, PageError, Notice } from '../components/ui.jsx';
import { NeighborGiftModal, NeedList } from '../components/Neighbors.jsx';
import { api, useApi } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { pts, money, money2, shortDate, plural, relTime } from '../lib/format.js';

const BADGE_ICON = { 'first-gift': Gift, neighbor: HandHelping, 'community-builder': Users, explorer: Compass, 'steady-hand': CalendarCheck, matched: Sparkles, 'cause-champion': Award, 'time-giver': Clock, 'good-neighbor': HomeIcon };

const impactLine = (c, dollars) => {
  const n = dollars * c.impact.perDollar;
  return `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10} ${c.impact.unit}`;
};
export const impactRate = (c) => (c.impact.perDollar >= 1
  ? `$1 ≈ ${c.impact.perDollar} ${c.impact.unit}`
  : `$${Math.round(1 / c.impact.perDollar)} ≈ 1 ${c.impact.unit.replace(/s$/, '').replace(/s of /, ' of ')}`);
const host = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export function Badges({ badges }) {
  return (
    <div className="badge-grid">
      {badges.map((b) => {
        const Icon = BADGE_ICON[b.key] || Award;
        return (
          <div key={b.key} className={`badge-cell ${b.earned ? '' : 'locked'}`} title={b.desc}>
            <div className={`medallion ${b.earned ? 'earned' : ''}`}><Icon /></div>
            <div className="name">{b.name}</div>
            <div className="small muted" style={{ fontSize: 11, lineHeight: 1.35 }}>{b.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

export function DonateModal({ charity, balance, campaigns, onClose, onDone }) {
  const toast = useToast();
  const max = Math.floor(balance / 100) * 100;
  const [amount, setAmount] = useState(Math.min(500, max));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const campaign = campaigns.find((c) => c.causes.includes(charity.cause) && c.remainingPoints > 0);
  const matched = campaign ? Math.min(amount * campaign.ratio, campaign.remainingPoints) : 0;
  const quick = [100, 250, 500, 1000, 2500].filter((q) => q <= max);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api('/giving/donations', { method: 'POST', body: { charityId: charity.id, points: amount } });
      setResult(r);
      onDone?.();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} image={charity.image} label={`${charity.causeLabel} · ${charity.mailingOnly ? 'Jacksonville' : `${charity.distance} mi away`}`} title={result ? 'Thank you.' : charity.name}>
      {result ? (
        <div className="stack gap-4 fade-in">
          <p className="serif" style={{ fontSize: 26, lineHeight: 1.2 }}>
            Your gift provides about <span className="gold">{result.impact.amount} {result.impact.unit}</span>{result.donation.matchedPoints ? ', including the partner match' : ''}.
          </p>
          {(result.levelUp || result.newBadges.length > 0) && (
            <div className="card elevated gold-edge pad stack gap-3" style={{ padding: 'var(--s4)' }}>
              {result.levelUp && <div className="row gap-3"><div className="medallion earned" style={{ width: 44, height: 44 }}><Award /></div><div><div className="label gold">New level</div><div>{result.levelUp.name}</div></div></div>}
              {result.newBadges.map((b) => {
                const Icon = BADGE_ICON[b.key] || Award;
                return <div key={b.key} className="row gap-3"><div className="medallion earned" style={{ width: 44, height: 44 }}><Icon /></div><div><div className="label gold">Badge earned</div><div>{b.name}</div></div></div>;
              })}
            </div>
          )}
          <div>
            <div className="kv"><span>Gift</span><span className="num">{pts(result.donation.points)} pts · {money2(result.donation.dollars)}</span></div>
            {result.donation.matchedPoints > 0 && <div className="kv"><span>Partner match</span><span className="num">+{money2(result.donation.matchedPoints / 100)}</span></div>}
            <div className="kv"><span>FIS transfer (simulated)</span><span className="num">{result.transfer.tranRefNbr}</span></div>
            {result.matchTransfer && <div className="kv"><span>Match transfer</span><span className="num">{result.matchTransfer.tranRefNbr}</span></div>}
            <div className="kv"><span>Impact score</span><span className="num">{pts(result.journey.impactScore)}</span></div>
          </div>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      ) : max < 100 ? (
        <p className="muted">You need at least 100 points to give. You can also give time. Volunteer shifts count toward your impact.</p>
      ) : (
        <>
          <p className="muted">{charity.mission}</p>
          <div className="row gap-4 wrap small">
            <span className="muted">EIN <span className="num" style={{ color: 'var(--text)' }}>{charity.ein}</span></span>
            <a className="gold row gap-1" href={charity.website} target="_blank" rel="noreferrer">{host(charity.website)}<ExternalLink size={12} /></a>
          </div>
          <div className="stack gap-2">
            <div className="row between">
              <span className="label">Your gift</span>
              <span className="num small muted">{pts(balance)} available</span>
            </div>
            <div className="row gap-3" style={{ alignItems: 'baseline' }}>
              <span className="serif num" style={{ fontSize: 46, lineHeight: 1 }}>{pts(amount)}</span>
              <span className="muted">pts · {money2(amount / 100)}</span>
            </div>
            <input className="range" type="range" min={100} max={max} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Points to give" />
            <div className="chips mt-2">
              {quick.map((q) => <button key={q} className={`chip ${amount === q ? 'active' : ''}`} onClick={() => setAmount(q)}>{pts(q)}</button>)}
              <button className={`chip ${amount === max ? 'active' : ''}`} onClick={() => setAmount(max)}>All</button>
            </div>
          </div>
          <div className="card elevated pad" style={{ padding: 'var(--s4)' }}>
            <div className="label">Estimated impact</div>
            <div className="serif mt-1" style={{ fontSize: 26 }}>≈ {impactLine(charity, (amount + matched) / 100)}</div>
            {campaign && matched > 0 && <div className="small gold mt-1">Includes {money2(matched / 100)} matched by {campaign.sponsor}</div>}
          </div>
          <Notice icon={Landmark}>Demo: a simulated FIS transfer from the Helping Hands rewards pool to a demo settlement account for {charity.name}. No real money moves, and impact figures are illustrative.</Notice>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Sending…' : `Give ${pts(amount)} points`}</button>
        </>
      )}
    </Modal>
  );
}

export function CharityCard({ c, campaigns, onGive }) {
  const matched = campaigns.some((m) => m.causes.includes(c.cause) && m.remainingPoints > 0);
  return (
    <article className="card interactive" onClick={() => onGive(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onGive(c)}>
      <div className="media"><Img name={c.image} fallback={c.name[0]} /><span className="tag badge">{c.causeLabel}</span></div>
      <div className="card-body">
        <h3 className="card-title">{c.name}</h3>
        <p className="small muted clamp-2">{c.mission}</p>
        <div className="row gap-4 small muted mt-1 wrap">
          <span className="row gap-1"><MapPin size={13} />{c.mailingOnly ? 'Location private' : `${c.distance} mi`}</span>
          <span>EIN {c.ein}</span>
        </div>
        <div className="small gold">{impactRate(c)}</div>
        <div className="card-foot">
          {matched ? <span className="badge gold">Matched</span> : <span />}
          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onGive(c); }}>Give</button>
        </div>
      </div>
    </article>
  );
}

export default function Give() {
  const { me, refreshMe } = useSession();
  const { data, error, loading, reload } = useApi('/giving');
  const [cause, setCause] = useState('');
  const [donateTo, setDonateTo] = useState(null);
  const [neighborArea, setNeighborArea] = useState(null);

  const causes = useMemo(() => {
    if (!data) return [];
    const present = new Set(data.charities.map((c) => c.cause));
    return Object.entries(data.causes).filter(([k]) => present.has(k));
  }, [data]);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError error={error} onRetry={reload} />;
  const j = data.journey;
  const list = cause ? data.charities.filter((c) => c.cause === cause) : data.charities;
  const givingFirst = me.experience?.key === 'give';
  const done = () => { reload({ quiet: true }); refreshMe(); };
  const openAreas = data.neighbors.areas.filter((a) => a.type === 'neighborhood' && a.targetable.lower);

  const neighborsSection = (
    <section className="section" key="neighbors">
      <SectionHead label="Neighbor Funds · model-detected need" title={`Give where ${data.market.name} needs it most`}>
        <button className="btn btn-primary btn-sm" onClick={() => setNeighborArea(openAreas[0]?.id || data.market.id)}>Give to neighbors</button>
      </SectionHead>
      <div className="split">
        <div className="card pad">
          <NeedList areas={data.neighbors.areas} onGive={(id) => setNeighborArea(id)} />
        </div>
        <div className="stack gap-4">
          <div className="card pad">
            <div className="label gold">How it works</div>
            <p className="mt-2">The income model scores every household in {data.market.name} from its banking patterns. Pick a neighborhood, or the whole city, and a group such as lower-income households. Your points are split evenly among them.</p>
            <p className="small muted mt-3">Recipients get “a gift from a neighbor” to spend on essentials. Donors only ever see neighborhood totals.</p>
          </div>
          <Notice icon={ShieldCheck}>Groups smaller than {data.neighbors.kMin} households are protected and can’t be targeted, so no gift can single anyone out.</Notice>
        </div>
      </div>
    </section>
  );

  const journeySection = (
    <section className="section split" key="journey">
      <div className="card pad">
        <div className="row between">
          <div className="label gold">Your giving journey</div>
          {j.streak > 0 && <span className="badge gold"><Flame />{plural(j.streak, 'month')}</span>}
        </div>
        <div className="row between wrap gap-4 mt-4" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="serif" style={{ fontSize: 'clamp(40px, 4vw, 56px)', lineHeight: 1 }}>{j.level.name}</div>
            <div className="muted small mt-2">{j.nextLevel ? `${pts(j.toNext)} impact to ${j.nextLevel.name}` : 'The highest level. Thank you.'}</div>
          </div>
          <div className="serif num muted" style={{ fontSize: 22 }}>{pts(j.impactScore)}{j.nextLevel && <span style={{ fontSize: 16 }}> / {pts(j.nextLevel.min)}</span>}</div>
        </div>
        <div className="mt-4"><Progress value={j.progress} /></div>
        <div className="level-track" aria-hidden="true">{j.levels.map((l, i) => <span key={l.key} className={i <= j.level.index ? 'on' : ''} />)}</div>
        <div className="row between mt-2">{j.levels.map((l) => <span key={l.key} className="label" style={{ fontSize: 9, letterSpacing: '0.1em' }}>{l.name}</span>)}</div>
        <hr className="divider" />
        <div className="grid-3" style={{ gap: 'var(--s4)' }}>
          <div className="stat"><div className="label">Points given</div><div className="value num">{pts(j.donatedPoints)}</div></div>
          <div className="stat"><div className="label">Volunteer hours</div><div className="value num">{j.volunteerHours}</div></div>
          <div className="stat"><div className="label">Neighbors helped</div><div className="value num">{pts(j.neighborHouseholds)}</div></div>
        </div>
        {j.impact.length > 0 && (
          <div className="row gap-2 wrap mt-5">
            {j.impact.map((i) => <span key={i.unit} className="badge gold">{pts(i.amount)} {i.unit}</span>)}
          </div>
        )}
        <p className="small muted mt-4">An hour of volunteering adds {pts(j.hourValue)} to your impact score, the same as a $5 gift. There are no dollar leaderboards here.</p>
      </div>

      <div className="stack gap-5">
        <div className="card pad">
          <div className="label gold">{data.community.title}</div>
          <div className="serif mt-2" style={{ fontSize: 40, lineHeight: 1 }}>{money(data.community.raisedDollars)}</div>
          <div className="small muted mt-1">of {money(data.community.targetDollars)} · {data.community.contributors.toLocaleString()} neighbors</div>
          <div className="mt-4"><Progress value={data.community.progress} /></div>
        </div>
        {data.campaigns.filter((c) => c.remainingPoints > 0).map((c) => (
          <div key={c.id} className="card pad gold-edge">
            <div className="row between"><div className="label gold">Partner match</div><span className="small muted">ends {shortDate(c.endsDt)}</span></div>
            <div className="mt-2">{c.title}</div>
            <div className="mt-3"><Progress value={c.usedPoints / c.capPoints} thin /></div>
            <div className="small muted mt-2 num">{pts(c.remainingPoints)} of {pts(c.capPoints)} match points left</div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="page">
      <Hero image="hero-give" label={givingFirst ? `${me.tier.name} member · giving first` : 'Give'}
        title={givingFirst ? <>Your rewards can<br /><span className="italic">lift your neighbors.</span></> : <>Turn rewards into<br /><span className="italic">meals, shelter and stories.</span></>}
        sub={givingFirst
          ? `Your ${me.tier.name} tier earns ${me.tier.multiplier}× on essentials. Your points go furthest with Jacksonville households the model finds need them most, or with the local charities below.`
          : 'Give points to real Jacksonville nonprofits, or give your time. Partners match gifts to the causes they champion.'}>
        <div className="hero-stats">
          <div className="hero-stat"><div className="label">Available to give</div><div className="value num">{pts(data.points)}</div><div className="sub">{money2(data.points / 100)}</div></div>
          <div className="hero-stat"><div className="label">Impact score</div><div className="value num">{pts(j.impactScore)}</div><div className="sub">{j.level.name}</div></div>
          <div className="hero-stat"><div className="label">Giving streak</div><div className="value num">{j.streak}</div><div className="sub">{j.streak === 1 ? 'month' : 'months'} in a row</div></div>
        </div>
      </Hero>

      <div className="container">
        {givingFirst ? [neighborsSection, journeySection] : [journeySection, neighborsSection]}

        <section className="section">
          <SectionHead label="Recognition" title="Badges" />
          <div className="card pad"><Badges badges={j.badges} /></div>
        </section>

        <section className="section">
          <SectionHead label={`${data.charities.length} real ${data.market.name} nonprofits`} title="Choose where it goes" />
          <div className="chips">
            <button className={`chip ${!cause ? 'active' : ''}`} onClick={() => setCause('')}>All causes</button>
            {causes.map(([k, label]) => <button key={k} className={`chip ${cause === k ? 'active' : ''}`} onClick={() => setCause(k)}>{label}</button>)}
          </div>
          <div className="grid-3 mt-5">
            {list.map((c) => <CharityCard key={c.id} c={c} campaigns={data.campaigns} onGive={setDonateTo} />)}
          </div>
          <p className="small muted mt-4">
            Charity names, EINs and addresses come from IRS records via ProPublica’s Nonprofit Explorer ({data.market.name}, {data.market.state} is the first market pulled). Gifts in this demo are simulated; no money reaches these organizations.
          </p>
        </section>

        <section className="section">
          <SectionHead label="History" title="Your gifts & time" />
          <div className="card pad">
            {j.history.length === 0 ? <div className="empty small">Your first gift will appear here.</div> : (
              <div className="list">
                {j.history.map((h) => (
                  <div key={h.id} className="list-item">
                    <div className="list-icon gold">{h.type === 'gift' ? (h.kind === 'neighbor' ? <Users /> : <HeartHandshake />) : <HandHelping />}</div>
                    <div className="grow">
                      <div className="small">{h.type === 'gift' ? (h.kind === 'neighbor' ? `${h.charity} · ${h.recipients} households` : `Gift to ${h.charity}`) : `${h.title} · ${h.charity}`}</div>
                      <div className="small muted">{relTime(h.ts)}{h.type === 'gift' && h.matchedPoints ? ` · matched ${money2(h.matchedPoints / 100)}` : ''}{h.fisRef && !h.fisRef.startsWith('FT-HIST') ? ` · FIS ${h.fisRef}` : ''}</div>
                    </div>
                    <div className="num muted">{h.type === 'gift' ? `${pts(h.points)} pts` : `${h.hours} hr`}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {donateTo && <DonateModal charity={donateTo} balance={data.points} campaigns={data.campaigns} onClose={() => setDonateTo(null)} onDone={done} />}
      {neighborArea && <NeighborGiftModal neighbors={data.neighbors} balance={data.points} initialAreaId={neighborArea} onClose={() => setNeighborArea(null)} onDone={done} />}
    </div>
  );
}
