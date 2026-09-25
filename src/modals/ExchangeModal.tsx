import { useEffect, useMemo, useState } from "react";
import UiIcons from "../components/UiIcons";
import "../styles/modals.css";
import { useLanguage } from "../i18n/LanguageContext";

type Props = {
  open: boolean;
  coins: number;
  onClose: () => void;
  onConfirm: (amountCoins: number) => void;
};


const MIN_COINS = 1000;
const RATE = 0.0000025;

export default function ExchangeModal({
  open,
  coins,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useLanguage();
  const [amountText, setAmountText] = useState("5000");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setMessage("");
      return;
    }

    setAmountText(String(Math.max(MIN_COINS, Math.min(coins, 5000))));
    setMessage("");
  }, [open, coins]);

  const amount = useMemo(() => {
    const parsed = Math.floor(Number(amountText));
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(parsed, coins));
  }, [amountText, coins]);

  const usdt = amount * RATE;
  const canExchange = amount >= MIN_COINS && amount <= coins;

  if (!open) return null;

  const handleMax = () => {
    setAmountText(String(coins));
    setMessage("");
  };

  const handleConfirm = () => {
    if (!canExchange) {
      setMessage(
        coins < MIN_COINS
          ? t("exchangeModal.notEnoughCoins")
          : t("exchangeModal.minimumExchange", { amount: MIN_COINS.toLocaleString() })
      );
      return;
    }

    onConfirm(amount);
    onClose();
  };

  const handleBackdrop = () => {
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-card exchange-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p>{t("exchangeModal.eyebrow")}</p>
            <h2>{t("exchangeModal.title")}</h2>
          </div>

          <button className="modal-close" onClick={handleBackdrop} aria-label={t("common.close")}>
            <UiIcons name="back" className="modal-close-icon" />
          </button>
        </div>

        <div className="exchange-hero">
          <div className="exchange-orb" />
          <div>
            <span>{t("exchangeModal.rateLabel")}</span>
            <strong>{t("exchangeModal.rateValue")}</strong>
          </div>
        </div>

        <label className="exchange-field">
          <span>{t("exchangeModal.amountLabel")}</span>
          <div className="exchange-input-row">
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder={t("exchangeModal.amountPlaceholder")}
            />
            <button className="exchange-max" onClick={handleMax} type="button">
              {t("exchangeModal.max")}
            </button>
          </div>
        </label>

        <div className="exchange-preview">
          <div>
            <span>{t("exchangeModal.youReceive")}</span>
            <strong>{usdt.toFixed(4)} USDT</strong>
          </div>

          <div>
            <span>{t("exchangeModal.available")}</span>
            <strong>{coins.toLocaleString()} {t("exchangeModal.coinsSuffix")}</strong>
          </div>
        </div>

        <div className="exchange-note">
          {message ? (
            <p>{message}</p>
          ) : (
            <p>
              {t("exchangeModal.noteDefault")}
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button className="modal-button ghost" onClick={handleBackdrop} type="button">
            {t("exchangeModal.cancel")}
          </button>

          <button className="modal-button primary" onClick={handleConfirm} type="button" disabled={!canExchange}>
            {t("exchangeModal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

