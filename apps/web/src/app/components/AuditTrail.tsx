// UI Adoption F7 — reusable event timeline.
//
// Doc 3 §2.4 says work_order_events and key_card_events "already have the
// shape". Checked against lib/api.ts, they do NOT:
//
//   WorkOrderEvent  { eventType, note,    createdAt,   performedByFirstName }
//   KeyCardEvent    { eventType, details, performedAt, staff }
//   AuditLogEntry   { action,    details, createdAt,   userFirstName, userRole }
//
// Three names for the verb, two for the timestamp, two for the note, three
// for the actor. So this file defines ONE normalised event and an adapter per
// source. The adapters live here, next to the renderer, rather than being
// re-improvised in each screen -- which is how the field names drift in the
// first place. Night audit, folio reversals, refunds and settlement will each
// need an adapter added here.
import type { ReactNode } from "react";
import { BORDER, MUTED, SUBTLE, TEXT, mono } from "../lib/tokens";
import type { AuditLogEntry, KeyCardEvent, WorkOrderEvent } from "../lib/api";

export interface TimelineEvent {
  id: string;
  /** The verb, already humanised. */
  label: string;
  /** ISO timestamp. */
  at: string;
  /** "Amaka O." — null when the actor is the system (a scheduled job). */
  actor: string | null;
  /** Free text: a note, a reason, a failure detail. */
  detail?: string | null;
  icon?: ReactNode;
}

// ─── Adapters ─────────────────────────────────────────────────────────────
const name = (first: string | null, last: string | null) =>
  [first, last].filter(Boolean).join(" ") || null;

/** snake_case / camelCase event types to readable text. */
export function humaniseEventType(raw: string): string {
  const spaced = raw.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function fromWorkOrderEvent(e: WorkOrderEvent): TimelineEvent {
  return {
    id: e.id,
    label: humaniseEventType(e.eventType),
    at: e.createdAt,
    actor: name(e.performedByFirstName, e.performedByLastName),
    detail: e.note,
  };
}

export function fromKeyCardEvent(e: KeyCardEvent): TimelineEvent {
  return {
    id: e.id,
    label: humaniseEventType(e.eventType),
    at: e.performedAt,
    actor: e.staff || null,
    detail: e.details,
  };
}

export function fromAuditLogEntry(e: AuditLogEntry): TimelineEvent {
  return {
    id: e.id,
    label: humaniseEventType(e.action),
    at: e.createdAt,
    // A null actor here is real and meaningful: scheduled backups and the
    // night-audit runner have no operator. Rendering "System" is honest;
    // inventing a user name would put a fiction in an audit record.
    actor: name(e.userFirstName, e.userLastName),
    detail: e.details,
  };
}

// ─── Renderer ─────────────────────────────────────────────────────────────
export interface AuditTrailProps {
  events: TimelineEvent[];
  empty?: string;
  /** Show absolute timestamps rather than "2h ago". Default: absolute. */
  relative?: boolean;
}

export function AuditTrail({ events, empty = "No activity recorded.", relative = false }: AuditTrailProps) {
  if (events.length === 0) {
    return <p className="text-[13px] py-4" style={{ color: MUTED }}>{empty}</p>;
  }

  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4">
          {/* Connector — omitted on the last item so the line doesn't dangle. */}
          {i < events.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[5px] top-[14px] bottom-0 w-px"
              style={{ background: BORDER }}
            />
          )}
          <span
            aria-hidden
            className="mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full"
            style={{ border: `2px solid ${SUBTLE}`, background: "#fff" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[13px]" style={{ fontWeight: 600, color: TEXT }}>{e.label}</span>
              <span className="text-[12px]" style={{ color: MUTED }}>
                {e.actor ?? "System"}
              </span>
              <time
                dateTime={e.at}
                className="text-[11px] ml-auto"
                style={{ color: SUBTLE, fontFamily: mono }}
              >
                {relative ? formatRelative(e.at) : formatAbsolute(e.at)}
              </time>
            </div>
            {e.detail && (
              <p className="mt-0.5 text-[12px] break-words" style={{ color: MUTED }}>{e.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-NG", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return formatAbsolute(iso);
}
