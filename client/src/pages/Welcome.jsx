import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Img, Skeleton } from '../components/ui.jsx';
import { Brand } from '../components/Shell.jsx';
import { useApi } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { ordinal } from '../lib/format.js';

export default function Welcome() {
  const { signIn } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useApi('/personas');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);

  const go = async (hhid) => {
    setBusy(hhid);
    try {
      const r = await signIn(hhid);
      const earned = r.sync?.everyday?.points;
      if (earned) toast.push({ title: `Welcome back, ${r.me.firstName}`, body: `+${earned} points from recent essentials` });
      navigate(location.state?.from || '/', { replace: true });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-media">
        <Img name="hero-give" />
        <div className="welcome-copy">
          <div className="label gold">Rewards with purpose</div>
          <h1 className="hero-title mt-3" style={{ maxWidth: 620 }}>Rewards that meet you where you are.</h1>
          <p className="hero-sub">Offers for groceries, childcare and getting to work, never luxuries. Households that need more get more back, and anyone can turn rewards or an afternoon into help for a neighbor.</p>
        </div>
      </div>

      <section className="welcome-panel">
        <Brand />
        <div>
          <div className="label">Demo members</div>
          <h2 className="section-title mt-2">Choose a member</h2>
          <p className="muted small mt-2">Each member’s history comes from a simulated FIS core banking system. All people and institutions are fictional.</p>
        </div>

        <div className="stack gap-3">
          {!data && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={78} />)}
          {data?.personas.map((p) => (
            <button key={p.hhid} className="card interactive persona" onClick={() => go(p.hhid)} disabled={!!busy}>
              <div className="avatar">{p.firstName[0]}{p.lastName[0]}</div>
              <div className="grow">
                <div className="row gap-2 wrap">
                  <span style={{ fontWeight: 500 }}>{p.firstName} {p.lastName}</span>
                  <span className="badge gold">{p.tier.name} · {p.tier.multiplier}×</span>
                  <span className="badge">{p.experience.label}</span>
                </div>
                <div className="small muted mt-1 clamp-2">{p.blurb}</div>
                <div className="label mt-1" style={{ letterSpacing: '0.1em' }}>{p.areaName} · {ordinal(p.percentile)} percentile · {p.linkedAccounts} linked accounts</div>
              </div>
              <ArrowRight size={18} className="muted" />
            </button>
          ))}
        </div>

        <form className="row gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) go(code.trim()); }}>
          <input className="input grow" placeholder="Or enter a Helping Hands ID (HH-XXXX-XXXX)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Helping Hands ID" />
          <button className="btn btn-secondary" type="submit" disabled={!code.trim() || !!busy}>Sign in</button>
        </form>
      </section>
    </div>
  );
}
