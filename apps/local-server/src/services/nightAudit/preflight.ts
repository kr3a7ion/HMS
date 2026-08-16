// Backend Blueprint B5 step 1 — preflight.
//
// Surfaces what a human should look at before the day is closed. The split
// between BLOCKING and WARNING is the useful part: a night audit that
// refuses to run over any imperfection never runs, and one that runs over
// everything closes a day the operator would have wanted to fix first.
//
// Nothing here is blocking yet, deliberately -- see the note on
// `unsettled_departures` below.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { reservations, rooms, guests } from "../../db/schema.js";
import { folioSummary } from "../folio.js";
import { businessDateOf, formatBusinessDate } from "../../lib/businessDate.js";

export type ExceptionSeverity = "blocking" | "warning";

export interface PreflightException {
  code: string;
  severity: ExceptionSeverity;
  message: string;
  entityType: "reservation" | "room";
  entityId: string;
  detail?: Record<string, unknown>;
}

export interface PreflightResult {
  businessDate: string;
  exceptions: PreflightException[];
  blocking: PreflightException[];
  warnings: PreflightException[];
  canRun: boolean;
}

export function runPreflight(branchId: string, businessDate: Date): PreflightResult {
  const exceptions: PreflightException[] = [];

  const branchReservations = db.select().from(reservations).where(eq(reservations.branchId, branchId)).all();
  const guestName = (guestId: string) => {
    const g = db.select().from(guests).where(eq(guests.id, guestId)).get();
    return g ? `${g.firstName} ${g.lastName}` : "Unknown guest";
  };

  // Guests whose departure date has passed but who are still checked in.
  // WARNING, not blocking: an overstay is a real and common situation
  // (extension not yet keyed in), and refusing to close the day over it
  // would strand the property. The audit still bills the night.
  for (const r of branchReservations) {
    if (r.status !== "checked_in") continue;
    if (businessDateOf(r.checkOutDate) <= businessDate) {
      exceptions.push({
        code: "unsettled_departure", severity: "warning",
        message: `${guestName(r.guestId)} was due to depart ${formatBusinessDate(r.checkOutDate)} but is still checked in`,
        entityType: "reservation", entityId: r.id,
      });
    }
  }

  // Arrivals that never showed. The audit's step 3 turns these into
  // no-shows, so this is informational -- it tells the operator what is
  // about to happen, which is the point of a preflight.
  for (const r of branchReservations) {
    if (r.status !== "confirmed") continue;
    if (businessDateOf(r.checkInDate) <= businessDate) {
      exceptions.push({
        code: "unactioned_arrival", severity: "warning",
        message: `${guestName(r.guestId)} was due to arrive ${formatBusinessDate(r.checkInDate)} and has not checked in — will be marked no-show`,
        entityType: "reservation", entityId: r.id,
      });
    }
  }

  // In-house guests carrying an unsettled balance. Informational: a balance
  // is normal mid-stay and is only a problem at departure.
  for (const r of branchReservations) {
    if (r.status !== "checked_in") continue;
    const folio = folioSummary(r.id);
    if (folio.balanceKobo > 0 && businessDateOf(r.checkOutDate) <= businessDate) {
      exceptions.push({
        code: "departing_with_balance", severity: "warning",
        message: `${guestName(r.guestId)} is past departure with an outstanding balance`,
        entityType: "reservation", entityId: r.id,
        detail: { balanceKobo: folio.balanceKobo },
      });
    }
  }

  // Occupied rooms with nobody assigned to clean them tomorrow. Housekeeping
  // assignment is HK's own module (B13 makes it a persisted assignment);
  // this reports the room-state inconsistency that is visible today.
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  for (const room of branchRooms) {
    if (room.status === "occupied" && room.housekeepingStatus === "dirty" && !room.assignedAttendantId) {
      exceptions.push({
        code: "dirty_occupied_room_unassigned", severity: "warning",
        message: `Room ${room.number} is occupied and dirty with no attendant assigned`,
        entityType: "room", entityId: room.id,
      });
    }
  }

  // Open POS shifts are B15; nothing to check until cash drawers exist.

  const blocking = exceptions.filter(e => e.severity === "blocking");
  const warnings = exceptions.filter(e => e.severity === "warning");
  return {
    businessDate: formatBusinessDate(businessDate),
    exceptions, blocking, warnings,
    canRun: blocking.length === 0,
  };
}
