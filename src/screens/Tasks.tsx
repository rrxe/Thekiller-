import { useEffect, useState } from "react";
import { actions } from "../lib/store";
import { ApiError, getApi, type TaskDto } from "../lib/api";
import { fmtPts } from "../lib/format";
import { errKey, useLang, useTx, useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { toast } from "../lib/toast";
import { Coin, Icon, LoadLine } from "../components/ui";
import AdsgramTask from "../components/AdsgramTask";

function openLink(url: string) {
  const w = (window as any).Telegram?.WebApp;
  try { if (/^https:\/\/(t\.me|telegram\.me)\//.test(url) && w?.openTelegramLink) return w.openTelegramLink(url); if (w?.openLink) return w.openLink(url); } catch { /* fall through */ }
  window.open(url, "_blank", "noopener");
}

type Filter = "all" | "channel" | "link";

export default function Tasks() {
  const t = useT();
  const tx = useTx();
  const ar = useLang() === "ar";
  const [list, setList] = useState<TaskDto[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<Filter>("all");
  const load = () => getApi().tasks().then(setList).catch(() => setList([]));
  const total = list?.length ?? 0;
  const done = list?.filter((k) => k.done).length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const visible = list?.filter((k) => filter === "all" || k.type === filter) ?? [];
  const countOf = (f: Filter) => (list ?? []).filter((k) => f === "all" || k.type === f).length;
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
  const tabs: [Filter, string][] = [["all", tx("الكل", "All", "Все", "सभी")], ["channel", tx("القنوات", "Channels", "Каналы", "चैनल")], ["link", tx("الروابط", "Links", "Ссылки", "लिंक")]];

  return <div className="page tk-page">
    {/* hero: title + overall progress ring */}
    <div className="tk-hero">
      <span className="tk-hero-ico"><Icon name="tasks" size={24} /></span>
      <div className="tk-hero-txt"><h1>{t("tasks")}</h1><p>{t("tasksHint")}</p></div>
      {total > 0 && <div className="tk-ring" style={{ ["--p" as any]: `${pct}%` }} role="img" aria-label={`${done}/${total}`}><span className="num" dir="ltr">{done}/{total}</span></div>}
    </div>

    {/* ad task: its own tinted zone */}
    <section className="tk-zone tk-zone-ad">
      <div className="tk-zone-head"><span className="tk-badge is-ad"><Icon name="play" size={13} /></span><h2>{t("adTaskGroup")}</h2></div>
      <AdsgramTask />
    </section>

    <section className="tk-zone">
      <div className="tk-zone-head">
        <span className="tk-badge"><Icon name="check" size={14} /></span><h2>{t("tasks")}</h2>
        {total > 0 && <span className="tk-count num" dir="ltr">{done} / {total}</span>}
      </div>
      {total > 0 && <div className="tk-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>}
      {list === null && <LoadLine />}
      {total > 0 && <div className="tk-tabs" role="tablist">{tabs.map(([key, label]) => <button type="button" key={key} role="tab" aria-selected={filter === key} className={`tk-tab ${filter === key ? "is-active" : ""}`} onClick={() => setFilter(key)}>{label}<em className="num">{countOf(key)}</em></button>)}</div>}
      {list?.length === 0 && <div className="empty-state"><span className="es-ico"><Icon name="check" size={22} /></span><strong>{t("noTasks")}</strong><small>{t("emptyTasksHint")}</small></div>}
      {total > 0 && visible.length === 0 && <div className="tk-none">{t("noTasks")}</div>}

      <div className="tk-list">
        {visible.map((k) => {
          const left = k.started_at_ms ? Math.max(0, Math.ceil(k.wait_seconds - (now - k.started_at_ms) / 1000)) : k.wait_seconds;
          const started = !!k.started_at_ms;
          const wait = k.type === "link" && started && left > 0;
          const title = ar && k.title_ar ? k.title_ar : k.title_en;
          return <div className={`tk-card is-${k.type} ${k.done ? "is-done" : ""}`} key={k.id}>
            <span className="tk-ico"><Icon name={k.done ? "check" : k.type === "channel" ? "send" : "link"} size={20} /></span>
            <div className="tk-main">
              <strong className="tk-title">{title}</strong>
              <div className="tk-meta">
                <span className="tk-type">{k.type === "channel" ? tx("اشتراك قناة", "Channel", "Подписка на канал", "चैनल जॉइन") : tx("زيارة رابط", "Link visit", "Переход по ссылке", "लिंक विज़िट")}</span>
                <span className="tk-reward num" dir="ltr"><Coin size={14} />+{fmtPts(k.reward_cp)}</span>
              </div>
            </div>
            {k.done ? <span className="tk-state is-ok"><Icon name="check" size={14} />{t("taskDone")}</span>
              : !started ? <button type="button" className="tk-btn" onClick={() => start(k)}>{t("go")}</button>
              : <button type="button" className={`tk-btn ${wait ? "is-wait" : "is-claim"}`} onClick={() => claim(k)} disabled={busy === k.id || wait}>{busy === k.id ? t("verifying") : wait ? <span className="num" dir="ltr">{left}s</span> : t("claim")}</button>}
          </div>;
        })}
      </div>
    </section>
  </div>;
}
