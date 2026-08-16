// UI Adoption F6 — typed confirmation with a reason.
//
// Doc 3 §2.4: "Voids, revocations, overrides -- all need typed confirmation
// and a reason field."
//
// The reason is not ceremony. The server-side actions this guards
// (folio void, payment reversal, key revocation, night-audit override) all
// write an audit row, and several REQUIRE a reason in their request body --
// a void with an empty reason is rejected by the API, not by this dialog.
// So the field is here because the operation genuinely needs it, and the
// text lands in a record a manager reads later.
//
// The typed-phrase step exists only for the irreversible ones. Asking a
// clerk to type "VOID" forty times a day would train them to type it without
// reading, which is worse than one deliberate click -- so `confirmPhrase` is
// opt-in, not the default.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BORDER, ERROR, MUTED, TEXT, mono } from "../lib/tokens";
import { useTier, touchTarget } from "../lib/tier";

export interface ConfirmDestructiveProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. State the consequence, not the verb. */
  body: string;
  confirmLabel: string;
  /** Require this exact string to be typed. Use for irreversible actions only. */
  confirmPhrase?: string;
  /** Most destructive endpoints reject an empty reason server-side. */
  requireReason?: boolean;
  reasonLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function ConfirmDestructive({
  open, title, body, confirmLabel, confirmPhrase,
  requireReason = true, reasonLabel = "Reason", busy = false,
  onCancel, onConfirm,
}: ConfirmDestructiveProps) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const tier = useTier();
  const firstFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) { setReason(""); setTyped(""); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    firstFieldRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const phraseOk = !confirmPhrase || typed.trim() === confirmPhrase;
  const reasonOk = !requireReason || reason.trim().length > 0;
  const canConfirm = phraseOk && reasonOk && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cd-title"
        className="w-full max-w-[460px] rounded-xl bg-white p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} style={{ color: ERROR, flexShrink: 0, marginTop: 2 }} />
          <div className="min-w-0">
            <h2 id="cd-title" className="text-[15px]" style={{ fontWeight: 600, color: TEXT }}>
              {title}
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: MUTED }}>{body}</p>
          </div>
        </div>

        {requireReason && (
          <label className="mt-4 block">
            <span className="block text-[12px]" style={{ color: MUTED }}>{reasonLabel}</span>
            <textarea
              ref={firstFieldRef as React.RefObject<HTMLTextAreaElement>}
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md px-3 py-2 text-[13px]"
              style={{ border: `1px solid ${BORDER}`, color: TEXT }}
            />
          </label>
        )}

        {confirmPhrase && (
          <label className="mt-3 block">
            <span className="block text-[12px]" style={{ color: MUTED }}>
              Type <span style={{ fontFamily: mono, color: TEXT }}>{confirmPhrase}</span> to confirm
            </span>
            <input
              ref={!requireReason ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
              value={typed}
              onChange={e => setTyped(e.target.value)}
              className="mt-1 w-full rounded-md px-3 text-[13px]"
              style={{ border: `1px solid ${BORDER}`, height: touchTarget(tier), fontFamily: mono }}
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 text-[13px]"
            style={{ border: `1px solid ${BORDER}`, color: TEXT, height: touchTarget(tier) }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!canConfirm}
            className="rounded-md px-3 text-[13px] text-white"
            style={{
              background: ERROR, height: touchTarget(tier),
              opacity: canConfirm ? 1 : 0.5,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
