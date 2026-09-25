import { useEffect, useState } from "react";
import UiIcons from "../components/UiIcons";
import "../styles/modals.css";

type RedeemResult = { success: boolean; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onRedeem: (code: string) => Promise<RedeemResult>;
};

export default function GiftCodeModal({ open, onClose, onRedeem }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setCode("");
      setBusy(false);
      setStatus("idle");
      setMessage("");
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setMessage("");

    const result = await onRedeem(trimmed);

    setBusy(false);
    setStatus(result.success ? "success" : "error");
    setMessage(result.message);

    if (result.success) {
      setCode("");
    }
  };

  const handleBackdrop = () => {
    if (busy) return;
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-card exchange-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p>Gift Code</p>
            <h2>Redeem Code</h2>
          </div>

          <button className="modal-close" onClick={handleBackdrop} aria-label="Close modal">
            <UiIcons name="back" className="modal-close-icon" />
          </button>
        </div>

        <label className="exchange-field">
          <span>Code</span>
          <div className="exchange-input-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter your gift code"
              autoCapitalize="characters"
              disabled={busy}
            />
          </div>
        </label>

        <div className="exchange-note">
          {message ? (
            <p style={{ color: status === "success" ? "#81c784" : "#ff8a80" }}>
              {message}
            </p>
          ) : (
            <p>Enter a gift code to claim your bonus coins.</p>
          )}
        </div>

        <div className="modal-actions">
          <button className="modal-button ghost" onClick={handleBackdrop} type="button" disabled={busy}>
            Cancel
          </button>

          <button
            className="modal-button primary"
            onClick={handleSubmit}
            type="button"
            disabled={!code.trim() || busy}
          >
            {busy ? "Redeeming..." : "Redeem"}
          </button>
        </div>
      </div>
    </div>
  );
}
