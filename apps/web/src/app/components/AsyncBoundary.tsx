// UI Adoption F4 — one loading/error/retry treatment.
//
// Doc 3 §2.4: "Currently each screen improvises." Measured: 55 of the 80
// screens hand-roll their own `loading` boolean, and NONE of them handle
// NetworkError distinctly from an API error -- so "the server is off" and
// "you don't have permission" render identically today.
//
// This component distinguishes the three cases that need different words:
//   - unreachable  -> the property server is down; retrying may work
//   - forbidden    -> the server refused; retrying will NOT help
//   - other error  -> show the code, offer retry
import type { ReactNode } from "react";
import { AlertTriangle, Lock, RefreshCw, WifiOff } from "lucide-react";
import { ApiError, NetworkError } from "../lib/api";
import { BORDER, ERROR, MUTED, PRIMARY, SUBTLE } from "../lib/tokens";

export interface AsyncBoundaryProps {
  loading: boolean;
  error?: unknown;
  /** Omit to disable the retry button (e.g. nothing sensible to re-run). */
  onRetry?: () => void;
  /** Rows to draw in the loading skeleton. Match the real content's shape. */
  skeletonRows?: number;
  children: ReactNode;
}

export function AsyncBoundary({
  loading, error, onRetry, skeletonRows = 5, children,
}: AsyncBoundaryProps) {
  if (loading) return <Skeleton rows={skeletonRows} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return <>{children}</>;
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 p-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-md"
          style={{ height: 44, background: "#F1F5F9", opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const unreachable = error instanceof NetworkError;
  const forbidden = error instanceof ApiError && error.status === 403;

  const Icon = unreachable ? WifiOff : forbidden ? Lock : AlertTriangle;
  const title = unreachable
    ? "Can't reach the property server"
    : forbidden
      ? "You don't have access to this"
      : "Couldn't load this";
  const body = unreachable
    ? "Check that the server machine is on and this device is on the property network."
    : forbidden
      ? "Your role doesn't include this permission. A manager can change that in Staff → Roles."
      : error instanceof ApiError
        ? `The server returned ${error.code}.`
        : "Something went wrong.";

  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg px-6 py-10 text-center"
      style={{ border: `1px solid ${BORDER}` }}
      role="alert"
    >
      <Icon size={22} style={{ color: forbidden ? SUBTLE : ERROR }} />
      <div className="text-[14px]" style={{ fontWeight: 600 }}>{title}</div>
      <div className="text-[13px] max-w-[46ch]" style={{ color: MUTED }}>{body}</div>
      {/* Retry is pointless on a 403 -- the answer will not change. */}
      {onRetry && !forbidden && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px]"
          style={{ border: `1px solid ${BORDER}`, color: PRIMARY }}
        >
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}
