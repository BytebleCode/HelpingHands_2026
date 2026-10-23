import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function BrandMark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="#D6B178" strokeWidth="1" />
      <path d="M11.5 9.5v13M20.5 9.5v13M11.5 16h9" stroke="#F4E8D6" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Editorial image with an elegant tonal fallback if the photo can't load. */
export function Img({ name, alt = '', fallback, className }) {
  const [failed, setFailed] = useState(false);
  if (!name || failed) return <div className={`img-fallback ${className || ''}`} aria-hidden="true">{fallback ?? ''}</div>;
  return <img className={className} src={`/images/${name}.jpg`} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function Hero({ image, label, title, sub, children, compact }) {
  return (
    <header className={`hero ${compact ? 'compact' : ''}`}>
      <div className="hero-media"><Img name={image} /></div>
      <div className="hero-body">
        {label && <div className="label gold">{label}</div>}
        <h1 className="hero-title">{title}</h1>
        {sub && <p className="hero-sub">{sub}</p>}
        {children}
      </div>
    </header>
  );
}

export function SectionHead({ label, title, children }) {
  return (
    <div className="section-head">
      <div>
        {label && <div className="label">{label}</div>}
        <h2 className="section-title">{title}</h2>
      </div>
      {children && <div className="row gap-2">{children}</div>}
    </div>
  );
}

export function Progress({ value, thin }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={`progress ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, label, image, wide, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {image && <div className="modal-media"><Img name={image} /></div>}
        <div className="modal-head">
          <div>
            {label && <div className="label gold">{label}</div>}
            <h2 className="section-title mt-2">{title}</h2>
          </div>
          <button className="btn btn-secondary icon-btn" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Notice({ icon: Icon, children }) {
  return <div className="notice">{Icon && <Icon />}<div className="small">{children}</div></div>;
}

export function Skeleton({ height = 200, style }) {
  return <div className="skeleton" style={{ height, ...style }} />;
}

export function PageLoading() {
  return (
    <div className="page">
      <Skeleton height={420} style={{ borderRadius: 0 }} />
      <div className="container section grid-3">
        <Skeleton height={260} /><Skeleton height={260} /><Skeleton height={260} />
      </div>
    </div>
  );
}

export function PageError({ error, onRetry }) {
  return (
    <div className="container section">
      <div className="empty">
        <p>{error?.message || 'Something went wrong.'}</p>
        {onRetry && <button className="btn btn-secondary mt-4" onClick={() => onRetry()}>Try again</button>}
      </div>
    </div>
  );
}

// Code 39 barcode for legacy point-of-sale scanners (each symbol: 5 bars + 4 spaces, 3 wide).
const CODE39 = {
  0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
};

export function Barcode({ value }) {
  const text = String(value).toUpperCase().replace(/[^0-9A-Z\-. ]/g, '');
  const symbols = `*${text}*`.split('');
  const N = 2, W = 5;
  const rects = [];
  let x = 10;
  for (const ch of symbols) {
    const pattern = CODE39[ch];
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === 'w' ? W : N;
      if (i % 2 === 0) rects.push(<rect key={`${rects.length}`} x={x} y={0} width={w} height={60} />);
      x += w;
    }
    x += N; // inter-character gap
  }
  return (
    <div className="barcode">
      <svg viewBox={`0 0 ${x + 8} 60`} preserveAspectRatio="none" fill="#0B0E12" role="img" aria-label={`Barcode ${text}`}>{rects}</svg>
      <div className="txt">{text}</div>
    </div>
  );
}
