import { useEffect, useState } from "react";
import { getApi, type Leaderboard as LB, type LeaderRow } from "../lib/api";
import { useT } from "../lib/i18n";
import { Coin } from "./ui";

const MEDAL = ["🥇", "🥈", "🥉"];
const fmtPts = (cp: number) => (cp / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Top players list (by points or referrals) + the player's own rank when outside the top. Hides itself if the endpoint/migration is unavailable. */
export default function Leaderboard({ kind, limit = 10 }: { kind: "points" | "referrals"; limit?: number }) {
  const t = useT();
  const [data, setData] = useState<LB | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    getApi().leaderboard(kind).then((r) => { if (!off) setData(r); }).catch(() => { if (!off) setFailed(true); });
    return () => { off = true; };
  }, [kind]);
  if (failed) return null;

  const score = (r: { score: number }) => kind === "points"
    ? <span className="lb-score num" dir="ltr"><Coin size={14} />{fmtPts(r.score)}</span>
    : <span className="lb-score num" dir="ltr">{r.score.toLocaleString()} <small>{t("lbInvites")}</small></span>;
  const row = (r: LeaderRow, extra = "") => <div key={`${r.rank}-${r.name}-${extra}`} className={`lb-row ${r.me ? "is-me" : ""} ${r.rank <= 3 ? `top-${r.rank}` : ""}`}>
    <span className="lb-rank num">{r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}</span>
    <span className="lb-av" aria-hidden="true">{Array.from(r.name)[0]?.toUpperCase() || "?"}</span>
    <span className="lb-name" dir="auto">{r.name}{r.me && <em>{t("lbYou")}</em>}</span>
    {score(r)}
  </div>;

  if (!data) return <div className="lb" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="lb-row lb-skel"><span /><span /><span /></div>)}</div>;
  const top = data.top.slice(0, limit);
  if (!top.length) return <div className="empty-state"><span className="es-ico"><span style={{ fontSize: 20 }}>🏆</span></span><small>{t("lbEmpty")}</small></div>;
  const meOut = data.me && !top.some((r) => r.me) ? data.me : null;
  return <div className="lb">
    {top.map((r) => row(r))}
    {meOut && <><div className="lb-gap" aria-hidden="true">⋯</div>{row({ ...meOut, me: true }, "me")}</>}
  </div>;
}
