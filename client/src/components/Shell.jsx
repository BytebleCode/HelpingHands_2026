import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { House, Ticket, HeartHandshake, CircleUserRound, LogOut, FlaskConical } from 'lucide-react';
import { BrandMark, Progress } from './ui.jsx';
import { useSession } from '../lib/session.jsx';
import { pts, money2 } from '../lib/format.js';
import { NudgeBanner } from './Nudge.jsx';

const NAV_ITEMS = {
  home: { to: '/', label: 'Home', icon: House, end: true },
  rewards: { to: '/rewards', label: 'Rewards', icon: Ticket },
  give: { to: '/give', label: 'Give', icon: HeartHandshake },
  account: { to: '/account', label: 'Account', icon: CircleUserRound },
};
const DEFAULT_ORDER = ['home', 'rewards', 'give', 'account'];

export function Brand() {
  return (
    <div className="brand">
      <BrandMark />
      <span className="brand-name">Helping <em>Hands</em></span>
    </div>
  );
}

export default function Shell() {
  const { me, signOut } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  if (!me) return null;
  const initials = `${me.firstName[0]}${me.lastName[0]}`;
  // Giving-first members see Give ahead of Rewards.
  const NAV = (me.experience?.nav || DEFAULT_ORDER).map((k) => NAV_ITEMS[k]);
  const giving = me.experience?.key === 'give';

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Primary">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}><Icon />{label}</NavLink>
          ))}
          <div className="nav-divider" />
          <NavLink to="/demo"><FlaskConical />Demo</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="wallet-mini">
            <div className="label">{giving ? 'Available to give' : 'Rewards balance'}</div>
            <div className="pts num">{pts(me.points)}</div>
            <div className="small muted">{money2(me.pointsValue)} · {me.tier.name} {me.tier.multiplier}×</div>
            <div className="mt-4"><Progress value={me.journey.progress} thin /></div>
            <div className="small muted mt-2">{me.journey.level.name}{me.journey.nextLevel ? ` → ${me.journey.nextLevel.name}` : ''}</div>
          </div>
          <div className="member-row">
            <div className="avatar">{initials}</div>
            <div className="grow">
              <div className="small truncate">{me.firstName} {me.lastName}</div>
              <div className="label" style={{ letterSpacing: '0.1em' }}>{me.hhid}</div>
            </div>
            <button className="btn btn-ghost icon-btn" title="Switch member" aria-label="Switch member" onClick={() => { signOut(); navigate('/welcome'); }}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <Brand />
        <div className="row gap-2">
          <NavLink to="/demo" className="pill" aria-label="Demo"><FlaskConical size={14} className="gold" />Demo</NavLink>
          <NavLink to="/account" className="pill num"><span className="dot" />{pts(me.points)}</NavLink>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon />{label}</NavLink>
        ))}
      </nav>
      {/* Moment-of-intent pop-up; hidden until a page calls useNudge().show(). */}
      <NudgeBanner />
    </div>
  );
}
