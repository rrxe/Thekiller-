import "../styles/withdrawal-channel.css";

const WITHDRAWAL_CHANNEL_URL = "https://t.me/SLYMintX_payment";

type Props = {
  open: boolean;
  onClose: () => void;
  onContinue?: () => void;
  showContinue?: boolean;
};

function openTelegramChannel() {
  try {
    const webApp = (window as any).Telegram?.WebApp;
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(WITHDRAWAL_CHANNEL_URL);
      return;
    }
  } catch {}

  window.open(WITHDRAWAL_CHANNEL_URL, "_blank", "noopener,noreferrer");
}

export default function WithdrawalChannelModal({
  open,
  onClose,
  onContinue,
  showContinue = false,
}: Props) {
  if (!open) return null;

  return (
    <div className="withdrawal-channel-backdrop" onClick={onClose}>
      <section
        className="withdrawal-channel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdrawal-channel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="withdrawal-channel-topline">
          <span>COMICX / NOTICE</span>
          <button
            type="button"
            className="withdrawal-channel-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="withdrawal-channel-burst" aria-hidden="true">
          <span>PAY</span>
        </div>

        <div className="withdrawal-channel-copy">
          <p className="withdrawal-channel-kicker">WITHDRAWAL CHANNEL</p>
          <h2 id="withdrawal-channel-title">Withdrawal Channel</h2>
          <p>Follow the official withdrawal channel for payout notices, updates, and processing announcements.</p>
        </div>

        <a
          className="withdrawal-channel-link"
          href={WITHDRAWAL_CHANNEL_URL}
          onClick={(event) => {
            event.preventDefault();
            openTelegramChannel();
          }}
        >
          <span className="withdrawal-channel-link-icon">↗</span>
          <span>
            <strong>SLYMintX_payment</strong>
            <small>t.me / official withdrawal channel</small>
          </span>
        </a>

        <div className="withdrawal-channel-actions">
          <button
            type="button"
            className="withdrawal-channel-primary"
            onClick={openTelegramChannel}
          >
            Open Withdrawal Channel
          </button>

          {showContinue ? (
            <button
              type="button"
              className="withdrawal-channel-secondary"
              onClick={() => {
                onContinue?.();
              }}
            >
              Continue to Withdrawal
            </button>
          ) : (
            <button
              type="button"
              className="withdrawal-channel-secondary"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
