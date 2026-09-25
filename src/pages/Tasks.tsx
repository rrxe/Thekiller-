import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import "../styles/tasks.css";

type Props = { onRewardCoins: (amount: number, title: string, meta: string) => void };
type ServerTask = { id: string | number; title: string; reward: number; url: string; is_active: boolean; task_type?: string; max_completions?: number; completed?: number };
type TaskProgress = { completed: number; max_completions: number };
type ProgressMap = Record<string, TaskProgress>;
type OpenedMap = Record<string, number>;
type TaskCategory = "all" | "join_channel" | "bots" | "other";
const CLAIM_DELAY_MS = 5000;

function getInitData() { return (window as any).Telegram?.WebApp?.initData || ""; }
function isSupportedTask(task: ServerTask) { return ["normal", "join_channel", "custom", "join_bot"].includes(String(task.task_type || "").toLowerCase()); }
function isJoinBotTask(task: ServerTask) { return String(task.task_type || "").toLowerCase() === "join_bot"; }
function getTaskCategory(task: ServerTask): TaskCategory { const type = String(task.task_type || "").toLowerCase(); if (type === "join_channel") return "join_channel"; if (type === "join_bot") return "bots"; return "other"; }

function TaskGlyph() { return <span className="task-glyph"><i/><i/><i/></span>; }

function translateTaskType(value: unknown) {
  const raw = String(value || "").toLowerCase();
  const map: Record<string, string> = {
    join_channel: "Join Channel",
    join_group: "Join Group",
    bot_join: "Join Bot",
    bots: "Bot",
    channel: "Channel",
    website: "Website",
    social: "Social",
    other: "Other",
    task: "Task",
  };
  return map[raw] || (raw ? "Task" : "Task");
}

export default function Tasks({ onRewardCoins }: Props) {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<TaskCategory>("all");
  const [toast, setToast] = useState("");
  const [serverTasks, setServerTasks] = useState<ServerTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [progressById, setProgressById] = useState<ProgressMap>({});
  const [openedAtById, setOpenedAtById] = useState<OpenedMap>({});
  const [openingIds, setOpeningIds] = useState<Record<string, boolean>>({});
  const [claimingIds, setClaimingIds] = useState<Record<string, boolean>>({});
  const claimTimersRef = useRef<Record<string, number>>({});

  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 1800); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const handler = (e: Event) => {
      const ids: (string | number)[] = Array.isArray((e as CustomEvent).detail) ? (e as CustomEvent).detail : [];
      if (!ids.length) return;
      setProgressById((prev) => { const next = { ...prev }; ids.forEach((id) => delete next[String(id)]); return next; });
    };
    window.addEventListener("stormy:channel-tasks-reset", handler); return () => window.removeEventListener("stormy:channel-tasks-reset", handler);
  }, []);
  useEffect(() => {
    fetch("/api/tasks/list", { headers: { Authorization: `tga ${getInitData()}` } })
      .then((res) => res.json()).then((data) => {
        if (data?.success && Array.isArray(data.tasks)) {
          const visible = (data.tasks as ServerTask[]).filter(isSupportedTask); setServerTasks(visible);
          setProgressById((prev) => { const next = { ...prev }; visible.forEach((task) => { const id = String(task.id); next[id] = { completed: Number(task.completed ?? 0), max_completions: Math.max(1, Number(task.max_completions || 1)) }; }); return next; });
        } else setServerTasks([]);
      }).catch(() => setServerTasks([])).finally(() => setLoadingTasks(false));
  }, []);

  const postTaskAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/tasks/complete", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `tga ${getInitData()}` }, body: JSON.stringify(body) });
    const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error || t("tasks.failedToProcessTask")); return data;
  };
  const clearClaimTimer = (id: string) => { const handle = claimTimersRef.current[id]; if (handle) { window.clearTimeout(handle); delete claimTimersRef.current[id]; } };
  const handleClaimServerTask = async (task: ServerTask) => {
    const id = String(task.id); if (claimingIds[id]) return;
    const openedAt = openedAtById[id]; if (!openedAt || Date.now() - openedAt < CLAIM_DELAY_MS) return;
    const current = progressById[id] || { completed: 0, max_completions: Math.max(1, Number(task.max_completions || 1)) };
    if (current.completed >= current.max_completions) return;
    setClaimingIds((prev) => ({ ...prev, [id]: true }));
    try {
      const data = await postTaskAction({ taskId: task.id });
      const nextCompleted = Number(data.progress?.completed ?? current.completed + 1);
      const nextMax = Number(data.progress?.max_completions ?? current.max_completions);
      const reward = Number(data.reward ?? task.reward ?? 0);
      setProgressById((prev) => ({ ...prev, [id]: { completed: nextCompleted, max_completions: nextMax } }));
      setOpenedAtById((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
      onRewardCoins(reward, task.title, t("tasks.taskProgressMeta", { completed: nextCompleted, max: nextMax, reward }));
      setToast(t("tasks.coinsRewardToast", { amount: reward }));
    } catch (err: any) { setToast(err?.message || t("tasks.failedToVerifyTask")); }
    finally { clearClaimTimer(id); setClaimingIds((prev) => { const copy = { ...prev }; delete copy[id]; return copy; }); }
  };
  const scheduleAutoClaim = (task: ServerTask, openedAt: number) => { const id = String(task.id); clearClaimTimer(id); const remaining = Math.max(0, CLAIM_DELAY_MS - (Date.now() - openedAt)); claimTimersRef.current[id] = window.setTimeout(() => { delete claimTimersRef.current[id]; handleClaimServerTask(task); }, remaining); };
  useEffect(() => {
    Object.entries(openedAtById).forEach(([id, openedAt]) => { if (claimTimersRef.current[id]) return; const task = serverTasks.find((item) => String(item.id) === id); if (!task) return; const p = progressById[id] || { completed: 0, max_completions: Math.max(1, Number(task.max_completions || 1)) }; if (p.completed >= p.max_completions) return; scheduleAutoClaim(task, Number(openedAt)); });
  }, [serverTasks, openedAtById, progressById]);
  useEffect(() => () => { Object.values(claimTimersRef.current).forEach((handle) => window.clearTimeout(handle)); claimTimersRef.current = {}; }, []);

  const handleOpenTask = async (task: ServerTask) => {
    const id = String(task.id); if (openingIds[id]) return;
    const progress = progressById[id] || { completed: 0, max_completions: Math.max(1, Number(task.max_completions || 1)) };
    if (progress.completed >= progress.max_completions) return setToast(t("tasks.taskLimitReached"));
    const url = String(task.url || "").trim(); if (!url) return setToast(t("tasks.taskNoUrl"));
    setOpeningIds((prev) => ({ ...prev, [id]: true }));
    try { await postTaskAction({ taskId: task.id, action: "open" }); window.open(url, "_blank", "noopener,noreferrer"); const openedAt = Date.now(); setOpenedAtById((prev) => ({ ...prev, [id]: openedAt })); scheduleAutoClaim(task, openedAt); setToast(t("tasks.openedSendingIn", { seconds: CLAIM_DELAY_MS / 1000 })); }
    catch (err: any) { setToast(err?.message || t("tasks.failedToOpenTask")); }
    finally { setOpeningIds((prev) => { const copy = { ...prev }; delete copy[id]; return copy; }); }
  };

  const visibleTasks = serverTasks.filter((task) => activeCategory === "all" || getTaskCategory(task) === activeCategory);
  const counts = { all: serverTasks.length, join_channel: serverTasks.filter((x) => getTaskCategory(x) === "join_channel").length, bots: serverTasks.filter((x) => getTaskCategory(x) === "bots").length, other: serverTasks.filter((x) => getTaskCategory(x) === "other").length };

  return (
    <section className="tasks-page">
      {toast ? <div className="tasks-toast">{toast}</div> : null}
      <header className="tasks-intro"><div><span className="tasks-kicker">COMICX / TASKS</span><h1>{t("tasks.heroTitle")}</h1><p>{t("tasks.heroSubtitle")}</p></div><div className="tasks-total"><b>{serverTasks.length}</b><span>TASKS</span></div></header>

      <section className="task-progress-overview"><div><span>{t("tasks.heroTitle")}</span><strong>{loadingTasks ? "—" : `${serverTasks.length} AVAILABLE`}</strong></div><div className="task-progress-meter"><i style={{ width: `${loadingTasks ? 18 : Math.min(100, serverTasks.length ? 72 : 0)}%` }}/></div></section>

      <div className="task-category-tabs">{(["all","join_channel","bots","other"] as TaskCategory[]).map((key) => {
        const labels: Record<TaskCategory, string> = { all: t("tasks.tabAll"), join_channel: t("tasks.tabJoinChannel"), bots: t("tasks.tabBots"), other: t("tasks.tabOther") };
        return <button key={key} type="button" className={activeCategory === key ? "active" : ""} onClick={() => setActiveCategory(key)}><span>{labels[key]}</span><b>{counts[key]}</b></button>;
      })}</div>

      <section className="tasks-feed">
        {loadingTasks ? <div className="task-empty"><span className="empty-spinner"/>{t("tasks.loadingTasks")}</div> : visibleTasks.length === 0 ? <div className="task-empty"><strong>—</strong>{t("tasks.noTasks")}</div> : visibleTasks.map((task, index) => {
          const progress = progressById[String(task.id)] || { completed: 0, max_completions: Math.max(1, Number(task.max_completions || 1)) };
          const openedAt = openedAtById[String(task.id)]; const opened = Boolean(openedAt); const waitedEnough = opened && Date.now() - openedAt >= CLAIM_DELAY_MS; const claimedAll = progress.completed >= progress.max_completions; const opening = Boolean(openingIds[String(task.id)]); const claiming = Boolean(claimingIds[String(task.id)]);
          return <article key={String(task.id)} className={`task-item ${claimedAll ? "done" : ""}`}>
            <div className="task-index">{String(index + 1).padStart(2,"0")}</div>
            <div className="task-glyph-wrap"><TaskGlyph /></div>
            <div className="task-content"><div className="task-meta-row"><span>{translateTaskType(task.task_type)}</span><strong>+{Number(task.reward || 0)}</strong></div><h2>{task.title}</h2><p>{isJoinBotTask(task) ? t("tasks.botJoinNote") : claimedAll ? t("tasks.completed") : !opened ? t("tasks.openLinkFirst") : !waitedEnough ? t("tasks.sendingCoinsIn", { seconds: Math.ceil((CLAIM_DELAY_MS - (Date.now() - openedAt)) / 1000) }) : claiming ? t("tasks.verifying") : t("tasks.readyProgress", { completed: progress.completed, max: progress.max_completions })}</p></div>
            <div className="task-side"><span>{progress.completed}/{progress.max_completions}</span><button type="button" onClick={() => handleOpenTask(task)} disabled={opening || claimedAll}>{opening ? "..." : claimedAll ? "✓" : "OPEN"}</button></div>
          </article>;
        })}
      </section>
    </section>
  );
}
