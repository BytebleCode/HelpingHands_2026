import { useState } from 'react';
import { Sparkles, Check, Clock3, CreditCard, History, Landmark, ScanLine } from 'lucide-react';
import { Img, Modal, Barcode } from './ui.jsx';
import { api } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { money2, pts, shortDate } from '../lib/format.js';

/** Activation with retroactive matching feedback. */
export function useOfferActions(onChange) {
  const toast = useToast();
  const { refreshMe } = useSession();
  const [busy, setBusy] = useState(null);
  const activate = async (offer) => {
    setBusy(offer.id);
    try {
      const r = await api(`/rewards/${offer.id}/activate`, { method: 'POST' });
      const hit = r.redemptions.find((x) => x.offerId === offer.id);
      if (hit) {
        toast.push({
          title: `${hit.retroactive ? 'Matched a past purchase' : 'Matched a purchase'} · +${pts(hit.points)} pts`,
          body: `${hit.merchant} ${money2(hit.tranAmt)} on ${shortDate(hit.postDt)} · settled via FIS ${hit.settlementRef}`,
          duration: 6500,
        });
      } else {
        toast.push({ title: 'Offer activated', body: `Pay ${offer.partner.name} with any linked account. Purchases from the last ${offer.lookbackDays} days count too.` });
      }
      await Promise.all([onChange?.(), refreshMe()]);
      return r;
    } catch (e) {
      toast.error(e);
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { activate, busy };
}

function StatusControl({ offer, onActivate, busy }) {
  if (offer.status === 'active') return <span className="badge gold"><Clock3 />Active</span>;
  if (offer.status === 'redeemed') {
    const last = offer.redemptions[offer.redemptions.length - 1];
    return <span className="badge positive"><Check />+{pts(last.points)} pts</span>;
  }
  return (
    <button className="btn btn-primary btn-sm" disabled={busy} onClick={(e) => { e.stopPropagation(); onActivate(offer); }}>
      {busy ? 'Activating…' : 'Activate'}
    </button>
  );
}

export function OfferValue({ offer }) {
  const v = offer.value;
  const boosted = offer.multiplier > 1;
  return (
    <div className="offer-value">
      <span className="big num">{v.headline}</span>
      {boosted && <s className="num">{v.kind === 'percent' ? `${v.baseRate}%` : `$${v.baseAmount}`}</s>}
    </div>
  );
}

export function OfferCard({ offer, onOpen, onActivate, busy }) {
  return (
    <article className="card interactive" onClick={() => onOpen(offer)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(offer)}>
      <div className="media">
        <Img name={offer.image} alt="" fallback={offer.partner.name[0]} />
        <span className="tag badge">{offer.categoryLabel}</span>
      </div>
      <div className="card-body">
        <div className="label">{offer.partner.name}</div>
        <h3 className="card-title">{offer.title}</h3>
        <OfferValue offer={offer} />
        <div className="reason"><Sparkles /><span className="clamp-2">{offer.reason}</span></div>
        <div className="card-foot">
          <span className="small muted">Min {money2(offer.minSpend).replace('.00', '')}</span>
          <StatusControl offer={offer} onActivate={onActivate} busy={busy === offer.id} />
        </div>
      </div>
    </article>
  );
}

export function OfferModal({ offer, onClose, onActivate, busy }) {
  if (!offer) return null;
  const v = offer.value;
  return (
    <Modal open onClose={onClose} image={offer.image} label={`${offer.categoryLabel} · ${offer.partner.name}`} title={offer.title} wide>
      <div className="row between wrap gap-4">
        <OfferValue offer={offer} />
        {offer.multiplier > 1 && <span className="badge gold">{offer.multiplier}× boost applied</span>}
      </div>
      <p className="muted">{offer.description}</p>
      <div className="notice">
        <Sparkles />
        <div className="small">
          {offer.reason}. {offer.partner.name} funds the base {v.kind === 'percent' ? `${v.baseRate}%` : `$${v.baseAmount}`}; Helping Hands adds your {offer.multiplier}× tier boost.
        </div>
      </div>

      <div className="grid-3" style={{ gap: 'var(--s4)' }}>
        {[
          [CreditCard, 'Card-linked', 'Works on every linked account. No new hardware at the register.'],
          [History, `Counts the past ${offer.lookbackDays} days`, 'Purchases you already made qualify once you activate.'],
          [Landmark, 'Settled through FIS', 'The partner settles from its FIS-core bank. Credit lands as points.'],
        ].map(([Icon, t, d]) => (
          <div key={t} className="stack gap-2">
            <div className="list-icon gold"><Icon /></div>
            <div className="small" style={{ fontWeight: 500 }}>{t}</div>
            <div className="small muted">{d}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="kv"><span>Minimum purchase</span><span className="num">{money2(offer.minSpend)}</span></div>
        {v.kind === 'percent' && <div className="kv"><span>Maximum reward</span><span className="num">{money2(v.cap)}</span></div>}
        <div className="kv"><span>Expires</span><span>{shortDate(offer.expiresDt)}</span></div>
      </div>

      <div className="code-card">
        <div className="row gap-2" style={{ justifyContent: 'center', marginBottom: 'var(--s3)' }}>
          <ScanLine size={16} className="gold" />
          <span className="label">Legacy register code</span>
        </div>
        <Barcode value={offer.legacyCode} />
        <p className="small muted mt-3">For registers that can’t see card-linked offers, the cashier can scan or key in this code.</p>
      </div>

      {offer.redemptions?.length > 0 && (
        <div>
          <div className="label mb-2">Redemptions</div>
          <div className="list">
            {offer.redemptions.map((r) => (
              <div key={r.txnKey} className="list-item">
                <div className="list-icon gold"><Check /></div>
                <div className="grow">
                  <div className="small">{r.merchant} · {money2(r.tranAmt)} on {shortDate(r.postDt)}{r.retroactive ? ' (past purchase)' : ''}</div>
                  <div className="small muted">FIS ref {r.settlementRef} · {r.account}</div>
                </div>
                <div className="num gold">+{pts(r.points)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row gap-3 wrap">
        {offer.status === 'active' ? (
          <span className="badge gold"><Clock3 />Active · watching your linked accounts</span>
        ) : (
          <button className="btn btn-primary" disabled={busy === offer.id} onClick={() => onActivate(offer)}>
            {busy === offer.id ? 'Activating…' : offer.status === 'redeemed' ? 'Activate again' : 'Activate offer'}
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
