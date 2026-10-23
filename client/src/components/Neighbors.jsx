import { useState } from 'react';
import { Check, ShieldCheck, Landmark, Home as HomeIcon, Users } from 'lucide-react';
import { Modal, Notice, Progress } from './ui.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/session.jsx';
import { pts, pct, money2 } from '../lib/format.js';

const countFor = (area, group) => (group === 'lowest' ? area.lowest : area.lower);

/** Compact list of neighborhoods by model-detected need, with a give action. */
export function NeedList({ areas, onGive, limit }) {
  const list = areas.filter((a) => a.type === 'neighborhood').slice(0, limit || 99);
  return (
    <div className="list">
      {list.map((a) => (
        <div key={a.id} className="list-item" style={{ alignItems: 'center' }}>
          <div className="grow">
            <div className="row between gap-3">
              <span>{a.name}</span>
              <span className="small muted num">{pct(a.needIndex)} lower-income · {a.households} households</span>
            </div>
            <div className="mt-2"><Progress value={a.needIndex} thin /></div>
          </div>
          {a.targetable.lower
            ? <button className="btn btn-secondary btn-sm" onClick={() => onGive(a.id)}>Give</button>
            : <span className="badge" title="Fewer than the minimum group size">Protected</span>}
        </div>
      ))}
    </div>
  );
}

export function NeighborGiftModal({ neighbors, balance, initialAreaId, onClose, onDone }) {
  const toast = useToast();
  const max = Math.floor(balance / 100) * 100;
  const firstOpen = neighbors.areas.find((a) => a.targetable.lower);
  const [areaId, setAreaId] = useState(initialAreaId || firstOpen?.id);
  const [group, setGroup] = useState('lower');
  const [amount, setAmount] = useState(Math.min(1000, max));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const area = neighbors.areas.find((a) => a.id === areaId);
  const n = area ? countFor(area, group) : 0;
  const ok = area && area.targetable[group];
  const per = ok && n ? Math.floor(amount / n) : 0;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api('/neighbors/gifts', { method: 'POST', body: { areaId, group, points: amount } });
      setResult(r);
      onDone?.();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} image="hero-neighbors" label="Neighbor Fund" title={result ? 'Shared with your neighbors.' : 'Give to neighbors in need'} wide>
      {result ? (
        <div className="stack gap-4 fade-in">
          <p className="serif" style={{ fontSize: 26, lineHeight: 1.2 }}>
            {pts(result.donation.points)} points reached <span className="gold">{result.recipients} {result.group.toLowerCase()}</span> in {result.areaName}, {pts(result.perHousehold)} points each.
          </p>
          {result.personasReached.length > 0 && (
            <Notice icon={Users}>{result.personasReached.join(' and ')} {result.personasReached.length > 1 ? 'are' : 'is'} among them. Switch members in the Demo tab to see the gift arrive.</Notice>
          )}
          {result.newBadges.map((b) => <div key={b.key} className="badge gold" style={{ alignSelf: 'flex-start' }}><Check />Badge earned · {b.name}</div>)}
          <div>
            <div className="kv"><span>FIS transfer to the Neighbor Fund</span><span className="num">{result.transfer.tranRefNbr}</span></div>
            <div className="kv"><span>Impact score</span><span className="num">{pts(result.journey.impactScore)}</span></div>
            <div className="kv"><span>Your balance</span><span className="num">{pts(result.balance)} pts</span></div>
          </div>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      ) : max < 100 ? (
        <p className="muted">You need at least 100 points to give.</p>
      ) : (
        <>
          <p className="muted">The income model finds households that need help most. You choose the area and the group; we split your gift evenly. You never see who receives it.</p>
          <div className="row gap-2 wrap" role="radiogroup" aria-label="Who to help">
            {neighbors.groups.map((g) => (
              <button key={g.key} role="radio" aria-checked={group === g.key} className={`chip ${group === g.key ? 'active' : ''}`} onClick={() => setGroup(g.key)}>{g.label}</button>
            ))}
          </div>
          <div className="area-list" style={{ maxHeight: 300, overflowY: 'auto' }}>
            {neighbors.areas.map((a) => {
              const count = countFor(a, group);
              const open = a.targetable[group];
              return (
                <button key={a.id} className={`area-option ${a.id === areaId ? 'selected' : ''}`} disabled={!open} onClick={() => setAreaId(a.id)}>
                  <span className="row gap-2">{a.type === 'city' ? <Users size={15} className="gold" /> : <HomeIcon size={15} className="muted" />}{a.name}{a.zip ? <span className="small muted">{a.zip}</span> : null}</span>
                  <span className="small muted num">{open ? `${count} households` : `under ${neighbors.kMin}, protected`}</span>
                  <Progress value={a.needIndex} thin />
                </button>
              );
            })}
          </div>
          <div className="stack gap-2">
            <div className="row between"><span className="label">Your gift</span><span className="num small muted">{pts(balance)} available</span></div>
            <div className="row gap-3" style={{ alignItems: 'baseline' }}>
              <span className="serif num" style={{ fontSize: 42, lineHeight: 1 }}>{pts(amount)}</span>
              <span className="muted">pts · {money2(amount / 100)}</span>
            </div>
            <input className="range" type="range" min={100} max={max} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Points to give" />
          </div>
          {ok && <div className="card elevated pad" style={{ padding: 'var(--s4)' }}>
            <div className="label">Preview</div>
            <div className="serif mt-1" style={{ fontSize: 24 }}>{n} households in {area.name} · about {pts(per)} pts each</div>
          </div>}
          <Notice icon={ShieldCheck}>Groups need at least {neighbors.kMin} households, so no gift can single anyone out. Recipients see “a gift from a neighbor”, never who sent it.</Notice>
          <Notice icon={Landmark}>Moved by FIS transfer from the rewards pool to the Helping Hands Neighbor Fund, then credited to recipients as points for essentials.</Notice>
          <button className="btn btn-primary" disabled={busy || !ok || per < 1} onClick={submit}>{busy ? 'Sending…' : `Give ${pts(amount)} points`}</button>
        </>
      )}
    </Modal>
  );
}
