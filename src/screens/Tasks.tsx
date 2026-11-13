import { useEffect, useState } from "react";
import { actions } from "../lib/store";
import { ApiError, getApi, type TaskDto } from "../lib/api";
import { fmtPts } from "../lib/format";
import { errKey, useLang, useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { toast } from "../lib/toast";
import { Icon, LoadLine } from "../components/ui";
import AdsgramTask from "../components/AdsgramTask";

function openLink(url: string) {
  const w = (window as any).Telegram?.WebApp;
  try { if (/^https:\/\/(t\.me|telegram\.me)\//.test(url) && w?.openTelegramLink) return w.openTelegramLink(url); if (w?.openLink) return w.openLink(url); } catch { /* fall through */ }
  window.open(url, "_blank", "noopener");
}

export default function Tasks() {
  const t = useT();
  const lang = useLang();
  const [list, setList] = useState<TaskDto[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<"all" | "channel" | "link">("all");
  const load = () => getApi().tasks().then(setList).catch(() => setList([]));
  const done = list?.filter((k) => k.done).length ?? 0;
  const visible = list?.filter((k) => filter === "all" || k.type === filter) ?? [];
  useEffect(() => { load(); const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const start = async (k: TaskDto) => {
    sfx.click();
    try { await getApi().taskStart(k.id); } catch { /* ignore */ }
    openLink(k.url);
    setList((l) => l && l.map((x) => (x.id === k.id ? { ...x, started_at_ms: x.started_at_ms ?? Date.now() } : x)));
  };
  const claim = async (k: TaskDto) => {
    setBusy(k.id);
    try {
      const r = await getApi().taskComplete(k.id);
      actions.setBalance(r.balance_cp); haptic.win(); sfx.win();
      toast(`+${fmtPts(r.reward_cp)} ${t("points")}`);
      await load();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("generic");
      const base = t(errKey(err.code));
      toast(err.code === "task_wait" && err.detail ? `${base} (${err.detail}s)` : base);
    } finally { setBusy(null); }
  };
  const tabs = [["all", lang === "ar" ? "الكل" : "All"], ["channel", lang === "ar" ? "القنوات" : "Channels"], ["link", lang === "ar" ? "الروابط" : "Links"]] as const;

  return <div className="page">
    <h1 className="h1">{t("tasks")}</h1>
    <p className="muted">{t("tasksHint")}</p>
    <h2 className="sec">{t("adTaskGroup")}</h2>
    <AdsgramTask />
    <h2 className="sec">{t("tasks")}</h2>
    {list === null && <LoadLine />}
    {list !== null && list.length > 0 && <>
      <div className="row-between"><span className="label">{lang === "ar" ? "مهام مكتملة" : "Completed"}</span><b className="num">{done} / {list.length}</b></div>
      <div className="bar"><i style={{ width: `${(done / list.length) * 100}%` }} /></div>
      <div className="tabs" role="tablist">{tabs.map(([key, label]) => <button type="button" key={key} role="tab" aria-selected={filter === key} className={`tab ${filter === key ? "is-active" : ""}`} onClick={() => setFilter(key)}>{label}</button>)}</div>
    </>}
    {list?.length === 0 && <div className="empty-state"><span className="es-ico"><Icon name="check" size={22} /></span><strong>{t("noTasks")}</strong><small>{t("emptyTasksHint")}</small></div>}
    <div className="list flat">
      {visible.map((k) => {
        const left = k.started_at_ms ? Math.max(0, Math.ceil(k.wait_seconds - (now - k.started_at_ms) / 1000)) : k.wait_seconds;
        const started = !!k.started_at_ms;
        const wait = k.type === "link" && started && left > 0;
        return <div className={`list-row ${k.done ? "is-done" : ""}`} key={k.id}>
          <span className="ico-box sm"><Icon name={k.done ? "check" : k.type === "channel" ? "shield" : "link"} size={18} /></span>
          <span className="grow"><strong>{lang === "ar" && k.title_ar ? k.title_ar : k.title_en}</strong>
            <small className="muted block">{k.type === "channel" ? (lang === "ar" ? "اشتراك قناة" : "Channel") : (lang === "ar" ? "زيارة رابط" : "Link visit")} · <span className="num win" dir="ltr">+{fmtPts(k.reward_cp)} {t("points")}</span></small></span>
          {k.done ? <span className="muted">{t("taskDone")}</span> : !started
            ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => start(k)}>{t("go")}</button>
            : <button type="button" className="btn btn-acc btn-sm" onClick={() => claim(k)} disabled={busy === k.id || wait}>{busy === k.id ? t("verifying") : wait ? `${left}s` : t("claim")}</button>}
        </div>;
      })}
    </div>
  </div>;
}
