import { useEffect, useState } from "react";
import UiIcons from "../components/UiIcons";
import "../styles/modals.css";
import { useLanguage } from "../i18n/LanguageContext";

type WithdrawMethod = "binance" | "bnb";

type Props = {
  open: boolean;
  usdtBalance: number;
  walletAddress: string | null;
  onClose: () => void;
  onConfirm: (
    amount: number,
    method: WithdrawMethod,
    target: string
  ) => void;
};

const MIN_WITHDRAW = 0.1;
const MAX_WITHDRAW = 0.2;

export default function WithdrawalModal({
  open,
  usdtBalance,
  walletAddress,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useLanguage();
  const [method, setMethod] = useState<WithdrawMethod>("binance");
  const [amountText, setAmountText] = useState("");
  const [binanceId, setBinanceId] = useState("");
  const [bnbAddress, setBnbAddress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setAmountText("");
      setBinanceId("");
      setBnbAddress("");
      setError("");
      setMethod("binance");
    } else {
      setBnbAddress(walletAddress || "");
    }
  }, [open, walletAddress]);

  if (!open) return null;

  const handleMax = () => {
    const maxAllowed = Math.min(
      MAX_WITHDRAW,
      Math.max(0, Number(usdtBalance || 0))
    );
    setAmountText(maxAllowed.toFixed(4));
    setError("");
  };

  const handleAmountChange = (value: string) => {
    setAmountText(value);
    setError("");

    const amount = Number(value);
    if (Number.isFinite(amount) && amount > MAX_WITHDRAW) {
      setError(
        t("withdrawModal.errorMaxPerWithdrawal", { max: MAX_WITHDRAW })
      );
    }
  };

  const handleWithdraw = () => {
    const amount = Number(amountText);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("withdrawModal.errorEnterValidAmount"));
      return;
    }

    if (amount < MIN_WITHDRAW) {
      setError(
        t("withdrawModal.errorMinWithdrawal", { min: MIN_WITHDRAW })
      );
      return;
    }

    if (amount > MAX_WITHDRAW) {
      setError(
        t("withdrawModal.errorMaxPerWithdrawal", { max: MAX_WITHDRAW })
      );
      return;
    }

    if (amount > usdtBalance) {
      setError(t("withdrawModal.errorInsufficientBalance"));
      return;
    }

    if (method === "binance") {
      const trimmed = binanceId.trim();
      if (!trimmed) {
        setError(t("withdrawModal.errorEnterBinanceId"));
        return;
      }

      onConfirm(Number(amount.toFixed(4)), "binance", trimmed);
      onClose();
      return;
    }

    const trimmedBnbAddress = bnbAddress.trim();
    if (!trimmedBnbAddress) {
      setError(t("withdrawModal.errorEnterGramAddress"));
      return;
    }

    onConfirm(Number(amount.toFixed(4)), "bnb", trimmedBnbAddress);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card exchange-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p>{t("withdrawModal.eyebrow")}</p>
            <h2>{t("withdrawModal.title")}</h2>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <UiIcons name="back" className="modal-close-icon" />
          </button>
        </div>

        <div className="withdraw-method-row">
          <button
            type="button"
            className={`withdraw-method-btn ${method === "binance" ? "active" : ""}`}
            onClick={() => {
              setMethod("binance");
              setError("");
            }}
          >
            {t("withdrawModal.binanceMethod")}
          </button>

          <button
            type="button"
            className={`withdraw-method-btn ${method === "bnb" ? "active" : ""}`}
            onClick={() => {
              setMethod("bnb");
              setError("");
            }}
          >
            {t("withdrawModal.gramMethod")}
          </button>
        </div>

        {method === "binance" ? (
          <label className="exchange-field">
            <span>{t("withdrawModal.binanceIdLabel")}</span>
            <div className="exchange-input-row">
              <input
                type="text"
                value={binanceId}
                onChange={(e) => {
                  setBinanceId(e.target.value);
                  setError("");
                }}
                placeholder={t("withdrawModal.binanceIdPlaceholder")}
              />
            </div>
          </label>
        ) : (
          <label className="exchange-field">
            <span>{t("withdrawModal.gramAddressLabel")}</span>
            <div className="exchange-input-row">
              <input
                type="text"
                value={bnbAddress}
                onChange={(e) => {
                  setBnbAddress(e.target.value);
                  setError("");
                }}
                placeholder={t("withdrawModal.gramAddressPlaceholder")}
              />
            </div>
          </label>
        )}

        <label className="exchange-field">
          <span>{t("withdrawModal.amountLabel")}</span>
          <div className="exchange-input-row">
            <input
              type="number"
              min={MIN_WITHDRAW}
              max={MAX_WITHDRAW}
              step="0.01"
              value={amountText}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder={t("withdrawModal.amountPlaceholder", {
                min: MIN_WITHDRAW,
                max: MAX_WITHDRAW,
              })}
            />

            <button
              className="exchange-max"
              onClick={handleMax}
              type="button"
            >
              {t("withdrawModal.max")}
            </button>
          </div>
        </label>

        <div className="exchange-preview">
          <div>
            <span>{t("withdrawModal.availableBalance")}</span>
            <strong>{usdtBalance.toFixed(4)} USDT</strong>
          </div>
        </div>

        <div className="exchange-note">
          {error ? (
            <p style={{ color: "#ff6b6b" }}>{error}</p>
          ) : (
            <p>
              {method === "binance"
                ? t("withdrawModal.noteBinance")
                : t("withdrawModal.noteGram")}
            </p>
          )}

          {!error ? (
            <p style={{ marginTop: 6 }}>
              {t("withdrawModal.minMax", {
                min: MIN_WITHDRAW,
                max: MAX_WITHDRAW,
              })}
            </p>
          ) : null}
        </div>

        <div className="modal-actions">
          <button
            className="modal-button ghost"
            onClick={onClose}
            type="button"
          >
            {t("withdrawModal.cancel")}
          </button>

          <button
            className="modal-button primary"
            onClick={handleWithdraw}
            type="button"
          >
            {t("withdrawModal.confirmWithdraw")}
          </button>
        </div>
      </div>
    </div>
  );
}
