import "../styles/splash.css";

type Props={progress:number;fading?:boolean};
export default function SplashScreen({progress,fading=false}:Props){
  const value=Math.max(0,Math.min(100,progress));
  const phase=value<28?"INITIALIZING":value<56?"SYNCING":value<84?"PREPARING":"READY";
  return <div className={`gx-splash${fading?" fading":""}`}>
    <div className="gx-splash-noise"/><div className="gx-splash-grid"/><div className="gx-splash-burst"/>
    <div className="gx-splash-top"><span>COMICX</span><span>MINING NETWORK</span></div>
    <main className="gx-splash-center">
      <div className="gx-loader-mark" aria-hidden="true"><div className="gx-burst-ring"/><div className="gx-burst-lines"/><div className="gx-loader-core"><span>C</span><b>X</b></div></div>
      <div className="gx-splash-wordmark">COMIC<span>X</span></div>
      <p>MINE · EARN · REPEAT</p>
      <div className="gx-splash-readout"><span>{phase}</span><strong>{String(Math.round(value)).padStart(3,"0")}%</strong></div>
      <div className="gx-splash-rail"><i style={{width:`${value}%`}}/><b style={{left:`${value}%`}}/></div>
    </main>
    <div className="gx-splash-bottom"><span>COMICX</span><span>WEB APP</span><span>READY WHEN YOU ARE</span></div>
  </div>;
}
