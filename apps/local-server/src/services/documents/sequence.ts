// Backend Blueprint B7 — gapless per-branch document numbering.
//
// WHAT "GAPLESS" IS ACTUALLY FOR. An invoice number is what an auditor
// reconciles against. "Where is ABU-INV-2026-00047?" has exactly two
// acceptable answers: "here it is", or "it was voided, here is the void
// record and the reason". "A transaction rolled back so the number was never
// used" is not one of them -- it is indistinguishable from a deleted invoice.
//
// TWO RULES, AND THE SECOND IS THE ONE PEOPLE GET WRONG:
//
//   1. Allocate inside the SAME transaction as the document. The bump and
//      the insert commit together or neither does, so a failed issuance
//      spends nothing. This is why allocateNumber does not open its own
//      transaction -- doing so would commit the bump independently and
//      reintroduce exactly the gap it exists to prevent.
//
//   2. Never reuse a voided number. A void keeps its row and its number
//      forever; the UNIQUE index on (branch_id, invoice_number) makes
//      reissuing it impossible even by hand. Reuse would mean two different
//      documents legitimately claiming one number, which is worse than a gap
//      because nothing detects it.
//
// The obvious alternative -- MAX(number) + 1 at insert time -- fails both:
// it races into duplicates under concurrency, and it silently reuses the
// number of a voided top-most document.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, documentSequences } from "../../db/schema.js";
import { HandlerError } from "../../lib/handlerError.js";
export type { DocumentSequenceRow };
type DocumentSequenceRow = typeof documentSequences.$inferSelect;

export const DOCUMENT_TYPES = [
  "invoice", "receipt", "credit_note", "proforma", "complaint", "trip",
] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

/** Default prefix code per type, used when a sequence is created on demand. */
const TYPE_CODES: Record<DocumentType, string> = {
  invoice: "INV", receipt: "RCP", credit_note: "CRN",
  proforma: "PRO", complaint: "CMP", trip: "TRP",
};

export interface AllocatedNumber {
  /** The formatted, human-facing number, e.g. "ABU-INV-2026-00047". */
  formatted: string;
  /** The raw integer, so a gap check is a plain arithmetic comparison. */
  sequenceNumber: number;
  prefix: string;
}

function branchCode(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, "");
  return (cleaned.slice(0, 3) || "BR").toUpperCase();
}

/**
 * Creates a branch's sequence for a type if it has none.
 *
 * Needed because migration 0007 seeds sequences for branches that existed at
 * migration time, and for the four types in use then. A branch created later,
 * or a type introduced later (complaint, trip), would otherwise have nothing
 * to allocate from -- and failing to issue a receipt because a row is missing
 * is a bad way to find that out.
 */
function ensureSequence(branchId: string, type: DocumentType) {
  const existing = db.select().from(documentSequences).where(and(
    eq(documentSequences.branchId, branchId),
    eq(documentSequences.documentType, type),
  )).get();
  if (existing) return existing;

  const branch = db.select().from(branches).where(eq(branches.id, branchId)).get();
  if (!branch) throw new HandlerError(400, "BRANCH_NOT_FOUND", { branchId });

  const prefix = `${branchCode(branch.name)}-${TYPE_CODES[type]}-${new Date().getUTCFullYear()}-`;
  db.insert(documentSequences).values({
    id: `docseq-${type}-${branchId}`,
    branchId, documentType: type, prefix,
    nextNumber: 1, padWidth: 5, createdAt: new Date(),
  }).run();

  return db.select().from(documentSequences).where(and(
    eq(documentSequences.branchId, branchId),
    eq(documentSequences.documentType, type),
  )).get()!;
}

export function formatDocumentNumber(prefix: string, sequenceNumber: number, padWidth: number): string {
  return `${prefix}${String(sequenceNumber).padStart(padWidth, "0")}`;
}

/**
 * Takes the next number for a branch and document type.
 *
 * MUST BE CALLED INSIDE THE CALLER'S TRANSACTION -- and specifically an
 * IMMEDIATE one, because this is a read-then-write on a single row and two
 * deferred transactions could both read the same next_number. Every caller
 * in this codebase goes through immediateTransaction; the UNIQUE index on the
 * document's number is the backstop if one ever does not.
 *
 * Not exported as a "safe" standalone helper on purpose: a version of this
 * that opened its own transaction would look more convenient and would be
 * wrong, because the bump would commit even when the document did not.
 */
export function allocateNumber(branchId: string, type: DocumentType): AllocatedNumber {
  const sequence = ensureSequence(branchId, type);
  const sequenceNumber = sequence.nextNumber;

  db.update(documentSequences)
    .set({ nextNumber: sequenceNumber + 1, updatedAt: new Date() })
    .where(eq(documentSequences.id, sequence.id))
    .run();

  return {
    formatted: formatDocumentNumber(sequence.prefix, sequenceNumber, sequence.padWidth),
    sequenceNumber,
    prefix: sequence.prefix,
  };
}

/** The prefix a type would get if it were configured now. */
export function defaultPrefix(branchName: string, type: DocumentType): string {
  return `${branchCode(branchName)}-${TYPE_CODES[type]}-${new Date().getUTCFullYear()}-`;
}

/**
 * Every document type, for the settings screen — including ones with no row
 * yet, flagged `configured: false`.
 *
 * Returning only the stored rows would mean the screen silently offers four
 * of the six types, and the two that are created on first use (complaint,
 * trip) could never have their prefix set BEFORE they were used, which is
 * the only moment it can safely be set at all.
 */
export function listSequences(branchId: string) {
  const branch = db.select().from(branches).where(eq(branches.id, branchId)).get();
  const stored = new Map(
    db.select().from(documentSequences).where(eq(documentSequences.branchId, branchId)).all()
      .map(row => [row.documentType, row]),
  );

  return DOCUMENT_TYPES.map(type => {
    const row = stored.get(type);
    if (row) return { ...row, configured: true, issued: row.nextNumber - 1 };
    return {
      id: null, branchId, documentType: type,
      prefix: defaultPrefix(branch?.name ?? "Branch", type),
      nextNumber: 1, padWidth: 5, createdAt: null, updatedAt: null,
      configured: false, issued: 0,
    };
  });
}

/**
 * Sets a type's prefix/padding, creating the sequence row if it has none.
 *
 * Refuses once the series is in use: two different-looking numbers sharing
 * one sequence position read as two documents when only one exists.
 * `next_number` is never settable — forward leaves a permanent gap, backward
 * guarantees a duplicate.
 */
export function configureSequence(
  branchId: string, type: DocumentType, prefix: string, padWidth?: number,
): { row: typeof documentSequences.$inferSelect; issued: number } {
  const existing = db.select().from(documentSequences).where(and(
    eq(documentSequences.branchId, branchId),
    eq(documentSequences.documentType, type),
  )).get();

  if (!existing) {
    db.insert(documentSequences).values({
      id: `docseq-${type}-${branchId}`,
      branchId, documentType: type, prefix,
      nextNumber: 1, padWidth: padWidth ?? 5, createdAt: new Date(),
    }).run();
    const row = db.select().from(documentSequences).where(and(
      eq(documentSequences.branchId, branchId),
      eq(documentSequences.documentType, type),
    )).get()!;
    return { row, issued: 0 };
  }

  const issued = existing.nextNumber - 1;
  if (issued > 0 && prefix !== existing.prefix) {
    throw new HandlerError(409, "SEQUENCE_IN_USE", {
      issued,
      message: `${issued} document(s) have already been issued under "${existing.prefix}". Changing the prefix now would make the series ambiguous.`,
    });
  }

  db.update(documentSequences).set({
    prefix,
    ...(padWidth !== undefined ? { padWidth } : {}),
    updatedAt: new Date(),
  }).where(eq(documentSequences.id, existing.id)).run();

  return { row: db.select().from(documentSequences).where(eq(documentSequences.id, existing.id)).get()!, issued };
}
