import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin, Flame, Gift, Ticket, HeartHandshake, ArrowDownLeft, HandHelping, Landmark, Users } from 'lucide-react';
import { Hero, SectionHead, Progress, Img, PageLoading, PageError } from '../components/ui.jsx';
import { OfferCard, OfferModal, useOfferActions } from '../components/Offers.jsx';
import { NeighborGiftModal, NeedList } from '../components/Neighbors.jsx';
import { CharityCard, DonateModal } from './Give.jsx';
import { useApi } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { greeting, pts, money, money2, longDate, shortDate, time12, relTime, plural, pct } from '../lib/format.js';

const LEDGER_ICON = { everyday: Ticket, offer: Gift, donation: HeartHandshake, cashout: Landmark, volunteer: HandHelping, 'neighbor-gift': Users };

export function ActivityList({ items }) {
  if (!items?.length) return <div className="empty small">No activity yet.</div>;
  return (
    <div className="list">
      {items.map((e) => {
        const Icon = LEDGER_ICON[e.type] || ArrowDownLeft;
        return (
          <div key={e.id} className="list-item">
            <div className={`list-icon ${e.points > 0 ? 'gold' : ''}`}><Icon /></div>
            <div className="grow">
              <div className="small truncate">{e.desc}</div>
              <div className="small muted">{relTime(e.ts)}{e.ref ? ` · FIS ${e.ref}` : ''}</div>
            </div>
            <div className={`num ${e.points > 0 ? 'gold' : 'muted'}`}>{e.points > 0 ? '+' : '−'}{pts(Math.abs(e.points))}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const { me, refreshMe } = useSession();
  const { data, error, loading, reload } = useApi('/home');
  const { activate, busy } = useOfferActions(() => reload({ quiet: true }));
  const [selectedId, setSelectedId] = useState(null);
  const [neighborArea, setNeighborArea] = useState(null);
  const [donateTo, setDonateTo] = useState(null);
  const neighbors = useApi('/neighbors');

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError error={error} onRetry={reload} />;
  const j = data.me.journey;
  const mode = me.experience?.key || 'save';
  const shift = data.nextShift || data.nearbyShift;
  const selected = data.picks.find((o) => o.id === selectedId);
  const done = () => { reload({ quiet: true }); neighbors.reload({ quiet: true }); refreshMe(); };

  const offers = (title, label) => (
    <section className="section" key="offers">
      <SectionHead label={label} title={title}>
        <Link to="/rewards" className="btn btn-secondary btn-sm">All rewards <ArrowRight /></Link>
      </SectionHead>
      <div className="carousel">
        {data.picks.map((o) => <OfferCard key={o.id} offer={o} onOpen={(x) => setSelectedId(x.id)} onActivate={activate} busy={busy} />)}
      </div>
    </section>
  );

  const received = data.neighborGiftsReceived.length > 0 && (
    <section className="section" key="received">
      <div className="card pad gold-edge row gap-4 wrap" style={{ alignItems: 'center' }}>
        <div className="medallion earned"><Users /></div>
        <div className="grow">
          <div className="label gold">Your neighbors have your back</div>
          <div className="serif mt-1" style={{ fontSize: 26 }}>+{pts(me.neighborGifts.points)} points from the {me.areaName} Neighbor Fund</div>
          <div className="small muted mt-1">Neighbors gave anonymously to households like yours. Use the points on essentials or cash them out.</div>
        </div>
        <Link to="/rewards" className="btn btn-primary">Use points</Link>
      </div>
    </section>
  );

  const needSection = (
    <section className="section" key="need">
      <SectionHead label="Model-detected need" title="Where your rewards do the most">
        <Link to="/give" className="btn btn-secondary btn-sm">All ways to give <ArrowRight /></Link>
      </SectionHead>
      <div className="split">
        <div className="card pad">{neighbors.data ? <NeedList areas={neighbors.data.areas} limit={5} onGive={setNeighborArea} /> : <div className="skeleton" style={{ height: 260 }} />}</div>
        <div className="stack gap-4">
          {data.neighborAreas[0] && (
            <div className="card pad">
              <div className="label gold">Highest need near you</div>
              <div className="serif mt-2" style={{ fontSize: 34, lineHeight: 1.05 }}>{data.neighborAreas[0].name}</div>
              <div className="small muted mt-1">{pct(data.neighborAreas[0].needIndex)} of households are lower-income ({data.neighborAreas[0].lower} of {data.neighborAreas[0].households})</div>
              <button className="btn btn-primary mt-4" onClick={() => setNeighborArea(data.neighborAreas[0].id)}>Give to {data.neighborAreas[0].name}</button>
            </div>
          )}
          {data.campaigns.map((c) => (
            <div key={c.id} className="card pad gold-edge" style={{ padding: 'var(--s4)' }}>
              <div className="label gold">Partner match · ends {shortDate(c.endsDt)}</div>
              <div className="mt-1">{c.title}</div>
              <div className="small muted mt-1 num">{pts(c.remainingPoints)} of {pts(c.capPoints)} match points remaining</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const charities = (
    <section className="section" key="charities">
      <SectionHead label={`Real ${data.me.market.name} nonprofits near you`} title="Give directly">
        <Link to="/give" className="btn btn-secondary btn-sm">All charities <ArrowRight /></Link>
      </SectionHead>
      <div className="grid-4">{data.charities.map((c) => <CharityCard key={c.id} c={c} campaigns={data.campaigns} onGive={setDonateTo} />)}</div>
    </section>
  );

  const journeyAndShift = (
    <section className="section split" key="journey">
      <div className="card pad stack gap-4">
        <div className="row between">
          <div className="label">Your giving journey</div>
          {j.streak > 0 && <span className="badge gold"><Flame />{plural(j.streak, 'month')}</span>}
        </div>
        <div>
          <div className="serif" style={{ fontSize: 44, lineHeight: 1 }}>{j.level.name}</div>
          <div className="muted small mt-2">Impact score <span className="num" style={{ color: 'var(--text)' }}>{pts(j.impactScore)}</span>{j.nextLevel ? ` · ${pts(j.toNext)} to ${j.nextLevel.name}` : ' · highest level'}</div>
        </div>
        <Progress value={j.progress} />
        <p className="small muted">Every point you give counts, and so does every hour you volunteer. Generosity here isn't measured by the size of your paycheck.</p>
        <div className="row gap-3 wrap">
          <Link to="/give" className="btn btn-primary">Give rewards</Link>
          <Link to="/volunteer" className="btn btn-secondary">Give time</Link>
        </div>
      </div>
      {shift ? (
        <Link to="/volunteer" className="card interactive">
          <div className="media"><Img name={shift.charity.image} /><span className="tag badge gold">{data.nextShift ? 'You’re signed up' : 'Near you'}</span></div>
          <div className="card-body">
            <div className="label">{shift.charity.name}</div>
            <h3 className="card-title">{shift.title}</h3>
            <div className="row gap-4 wrap small muted mt-1">
              <span className="row gap-1"><CalendarDays size={14} />{longDate(shift.dateIso)} · {time12(shift.start)}</span>
              <span className="row gap-1"><MapPin size={14} />{shift.charity.mailingOnly ? 'Location shared after signup' : `${shift.distance} mi`}</span>
            </div>
          </div>
        </Link>
      ) : <div className="empty">No upcoming shifts nearby.</div>}
    </section>
  );

  const communityGoal = (
    <section className="section" key="community">
      <div className="card pad">
        <div className="label gold">{data.community.title}</div>
        <div className="serif mt-2" style={{ fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1 }}>{money(data.community.raisedDollars)}</div>
        <div className="muted mt-2">{data.community.subtitle} · goal {money(data.community.targetDollars)}</div>
        <div className="mt-4"><Progress value={data.community.progress} /></div>
        <div className="small muted mt-2">{data.community.contributors.toLocaleString()} neighbors contributing</div>
      </div>
    </section>
  );

  const activity = (
    <section className="section" key="activity">
      <SectionHead label="Points" title="Recent activity">
        <Link to="/account" className="btn btn-ghost btn-sm">See all</Link>
      </SectionHead>
      <div className="card pad"><ActivityList items={data.activity} /></div>
    </section>
  );

  const layouts = {
    save: [received, offers('Selected for your essentials', 'Curated from your purchases'), journeyAndShift, communityGoal, activity],
    balance: [received, offers('Selected for your essentials', 'Curated from your purchases'), needSection, journeyAndShift, activity],
    give: [needSection, charities, journeyAndShift, offers('Your essentials offers', `${me.tier.name} tier · ${me.tier.multiplier}×`), activity],
  };

  const hero = mode === 'give' ? (
    <Hero image="hero-neighbors" label={`${me.tier.name} member · giving first`}
      title={<>{greeting()},<br /><span className="italic">{me.firstName}.</span></>}
      sub={`Your tier earns ${me.tier.multiplier}× on essentials, so your rewards do the most good for neighbors. ${data.neighborAreas[0] ? `${pct(data.neighborAreas[0].needIndex)} of ${data.neighborAreas[0].name} households are lower-income.` : ''}`}>
      <div className="hero-stats">
        <div className="hero-stat"><div className="label">Available to give</div><div className="value num">{pts(me.points)}</div><div className="sub">{money2(me.pointsValue)}</div></div>
        <div className="hero-stat"><div className="label">Neighbors helped</div><div className="value num">{pts(j.neighborHouseholds)}</div><div className="sub">through Neighbor Funds</div></div>
        <div className="hero-stat"><div className="label">Impact level</div><div className="value">{j.level.name}</div><div className="sub">{pts(j.impactScore)} impact</div></div>
      </div>
      <div className="row gap-3 wrap mt-6">
        <button className="btn btn-primary" onClick={() => setNeighborArea(data.neighborAreas[0]?.id || me.market.id)}>Give to neighbors</button>
        <Link to="/give" className="btn btn-secondary">Choose a charity</Link>
      </div>
    </Hero>
  ) : (
    <Hero image="hero-home" label={`${me.tier.name} member · ${me.tier.multiplier}× on essentials`}
      title={<>{greeting()},<br /><span className="italic">{me.firstName}.</span></>}
      sub={`Your rewards follow what your household actually needs. ${pct(data.essentials.share)} of your recent spending went to essentials, so that's where your offers are.`}>
      <div className="hero-stats">
        <div className="hero-stat"><div className="label">Rewards balance</div><div className="value num">{pts(me.points)}</div><div className="sub">{money2(me.pointsValue)} to spend or give</div></div>
        <div className="hero-stat"><div className="label">Benefit tier</div><div className="value">{me.tier.name}</div><div className="sub">{me.tier.multiplier}× every offer</div></div>
        <div className="hero-stat"><div className="label">Impact level</div><div className="value">{j.level.name}</div><div className="sub">{j.streak ? `${plural(j.streak, 'month')} giving streak` : 'Start a giving streak'}</div></div>
      </div>
    </Hero>
  );

  return (
    <div className="page">
      {hero}
      <div className="container">{layouts[mode].filter(Boolean)}</div>
      <OfferModal offer={selected} onClose={() => setSelectedId(null)} onActivate={activate} busy={busy} />
      {neighborArea && neighbors.data && <NeighborGiftModal neighbors={neighbors.data} balance={me.points} initialAreaId={neighborArea} onClose={() => setNeighborArea(null)} onDone={done} />}
      {donateTo && <DonateModal charity={donateTo} balance={me.points} campaigns={data.campaigns} onClose={() => setDonateTo(null)} onDone={done} />}
    </div>
  );
}
