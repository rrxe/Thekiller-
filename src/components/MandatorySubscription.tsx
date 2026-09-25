import { useState } from "react";
import "../styles/mandatory-subscription.css";
import { useLanguage } from "../i18n/LanguageContext";

function openMandatoryChannelLink(url: string) {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink && /t\.me\//i.test(url)) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch {}
  window.open(url, "_blank", "noopener,noreferrer");
}

type RequiredChannel = {
  id: string;
  title: string;
  url: string;
  joined: boolean;
};

type Props = {
  channels: RequiredChannel[];
  loading?: boolean;
  onVerify: () => Promise<void>;
};

function ChannelIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mandatory-channel-icon"
      aria-hidden="true"
    >
      <path
        d="M3 11.5 19.5 4l-3 16-6-4.2L7.5 18l-.6-5.3L3 11.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="m9.9 12.7 9.6-8.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mandatory-lock-icon"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M8 10V7.5a4 4 0 0 1 8 0V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <circle
        cx="12"
        cy="15"
        r="1"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mandatory-check-icon"
      aria-hidden="true"
    >
      <path
        d="M4 12.5 9.5 18 20 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MandatorySubscription({
  channels,
  loading = false,
  onVerify,
}: Props) {
  const { t } = useLanguage();
  const [checking, setChecking] =
    useState(false);

  const allJoined =
    channels.length > 0 &&
    channels.every(
      (channel) => channel.joined
    );

  const handleVerify = async () => {
    if (checking) return;

    setChecking(true);

    try {
      await onVerify();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mandatory-page">
      <div className="mandatory-content">
        <div className="mandatory-lock">
          <LockIcon />
        </div>

        <div className="mandatory-head">
          <h1>
            {t("mandatorySubscription.title")}
          </h1>

          <p>
            {t("mandatorySubscription.body")}
          </p>
        </div>

        <div className="mandatory-list">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className={`mandatory-channel ${
                channel.joined
                  ? "joined"
                  : ""
              }`}
            >
              <div className="mandatory-channel-left">
                <div className="mandatory-channel-icon-wrap">
                  <ChannelIcon />
                </div>

                <strong>
                  {channel.title}
                </strong>
              </div>

              <button
                type="button"
                className="mandatory-join"
                disabled={channel.joined}
                onClick={() => openMandatoryChannelLink(channel.url)}
              >
                {channel.joined
                  ? t("mandatorySubscription.joined")
                  : t("mandatorySubscription.join")}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mandatory-verify"
          onClick={handleVerify}
          disabled={
            checking ||
            allJoined
          }
        >
          {checking ? (
            <>
              <span className="mandatory-spinner" />
              {t("mandatorySubscription.checking")}
            </>
          ) : allJoined ? (
            <>
              <CheckIcon />
              {t("mandatorySubscription.verified")}
            </>
          ) : (
            <>
              <CheckIcon />
              {t("mandatorySubscription.verify")}
            </>
          )}
        </button>

        {loading ? (
          <div className="mandatory-loading">
            {t("mandatorySubscription.checkingMembership")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

