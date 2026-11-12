import { useState } from "react";
import { useChatTransport } from "./transport";

export function ClearChat({
  label,
  warning,
  path,
  data,
  onChanged,
}: {
  label: string;
  warning: string;
  path: string;
  data: Record<string, unknown>;
  onChanged: () => Promise<unknown>;
}) {
  const api = useChatTransport();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="clear-chat">
      {confirming ? (
        <>
          <p className="helper">{warning}</p>
          <div className="join-request-actions">
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setError("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api(path, data);
                  await onChanged();
                  setConfirming(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Removing…" : "Confirm removal"}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="text-button"
          onClick={() => setConfirming(true)}
        >
          {label}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
