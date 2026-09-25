import { useEffect, useState } from "react";
import UiIcons from "../components/UiIcons";
import "../styles/modals.css";
import { useLanguage } from "../i18n/LanguageContext";

type Props = {
  open: boolean;
  telegramId: string;
  onClose: () => void;
};

type RunnerLeaderRow = {
  rank: number;
  telegramId: string;
  name: string;
  score: number;
};

export default function RunnerLeaderboardModal({ open, telegramId, onClose }: Props) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [list, setList] = useState<RunnerLeaderRow[]>([]);
  const [me, setMe] = useState<RunnerLeaderRow | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    const query = telegramId
      ? `/api/leaderboard?type=runner&telegramId=${encodeURIComponent(telegramId)}`
      : `/api/leaderboard?type=runner`;

    fetch(query, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setList(Array.isArray(data.list) ? data.list : []);
        setMe(data.me ?? null);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, telegramId]);

  if (!open) return null;

  const meInTop = me && list.some((row) => row.telegramId === me.telegramId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p>{t("runnerLeaderboard.eyebrow")}</p>
            <h2>{t("runnerLeaderboard.title")}</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
            <UiIcons name="back" className="modal-close-icon" />
          </button>
        </div>

        {loading ? (
          <div className="runner-lb-status">{t("runnerLeaderboard.loading")}</div>
        ) : error ? (
          <div className="runner-lb-status">{t("runnerLeaderboard.failedToLoad")}</div>
        ) : list.length === 0 ? (
          <div className="runner-lb-status">{t("runnerLeaderboard.empty")}</div>
        ) : (
          <div className="runner-lb-list">
            {list.map((row) => (
              <div
                key={row.telegramId}
                className={`runner-lb-row${
                  me && row.telegramId === me.telegramId ? " runner-lb-row-me" : ""
                }`}
              >
                <span className="runner-lb-rank">#{row.rank}</span>
                <span className="runner-lb-name">{row.name}</span>
                <span className="runner-lb-score">{row.score}</span>
              </div>
            ))}

            {me && !meInTop ? (
              <div className="runner-lb-row runner-lb-row-me runner-lb-row-detached">
                <span className="runner-lb-rank">#{me.rank}</span>
                <span className="runner-lb-name">{me.name}</span>
                <span className="runner-lb-score">{me.score}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
