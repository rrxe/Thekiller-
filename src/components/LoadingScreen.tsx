import { useEffect, useState } from "react";

/** X mark (blue crystal). Pure gradients, no SVG filters → cheap on low-end Android WebViews. */
function CrystalX() {
  return <svg className="odx-ld__mark" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="odxXFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#EAF7FF" /><stop offset="45%" stopColor="#4CC0F5" /><stop offset="100%" stopColor="#1C8FCB" /></linearGradient>
      <linearGradient id="odxXEdge" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#0F5E86" /><stop offset="55%" stopColor="#9BDFFF" /><stop offset="100%" stopColor="#F4FBFF" /></linearGradient>
    </defs>
    <path d="M25 24 46 15l18 23 18-23 21 9-27 36 27 36-21 9-18-23-18 23-21-9 27-36-27-36Z" fill="url(#odxXFill)" />
    <path d="M46 15 64 38 82 15l10 4-28 39-28-39 10-4Z" fill="url(#odxXEdge)" opacity=".95" />
    <path d="m25 24 27 36-27 36 12 5 27-36L91 101l12-5-27-36 27-36-12-5-27 36-27-36-12 5Z" fill="none" stroke="#F4FBFF" strokeOpacity=".4" strokeWidth="1.8" />
  </svg>;
}

/** Animated splash: aurora + perspective grid + orbits + crystal X + staged progress.
 *  Progress eases toward ~92% while the app boots, jumps to 100% when `leaving`. Styles: .odx-ld in index.css */
export default function LoadingScreen({ leaving = false }: { leaving?: boolean }) {
  const [p, setP] = useState(4);
  useEffect(() => {
    if (leaving) { setP(100); return; }
    const id = window.setInterval(() => setP((v) => (v >= 92 ? v : v + Math.max(0.6, (92 - v) * 0.09))), 90);
    return () => window.clearInterval(id);
  }, [leaving]);
  const pct = Math.round(p);
  const stage = pct < 35 ? "01" : pct < 70 ? "02" : pct < 96 ? "03" : "04";
  return <div className={`loading-screen odx-ld ${leaving ? "is-leaving" : ""}`} role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-hidden={leaving} dir="ltr">
    <i className="odx-ld__aurora a1" /><i className="odx-ld__aurora a2" /><i className="odx-ld__aurora a3" />
    <i className="odx-ld__grid" /><i className="odx-ld__scan s1" /><i className="odx-ld__scan s2" />
    <i className="odx-ld__orbit o1"><span /></i><i className="odx-ld__orbit o2"><span /></i>
    <span className="odx-ld__corner tl">ODDXS ORIGINALS</span><span className="odx-ld__corner tr">SECURE SESSION</span>
    <span className="odx-ld__corner bl">PLAY / WIN / REPEAT</span><span className="odx-ld__corner br">PROVABLY FAIR</span>
    <div className="odx-ld__center">
      <div className="odx-ld__emblem" aria-hidden="true"><i className="odx-ld__halo h1" /><i className="odx-ld__halo h2" /><i className="odx-ld__glow" /><CrystalX /></div>
      <div className="odx-ld__brand">ODD<b>XS</b></div>
      <div className="odx-ld__sub">THE NEXT GENERATION GAMING EXPERIENCE</div>
      <div className="odx-ld__status"><i /><span>CONNECTING TO ODDXS</span><b>{stage}</b></div>
      <div className="odx-ld__bar"><div style={{ width: `${p}%` }} /></div>
      <div className="odx-ld__meta"><span>LOADING GAMES</span><b>{pct}%</b></div>
    </div>
  </div>;
}
