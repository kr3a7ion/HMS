// Backend Blueprint B18 — the decision: may this release be installed here?
//
// ONE PURE FUNCTION, deliberately. Every refusal reason lives in one place
// with no I/O, so the rules can be exhaustively tested without a Docker
// daemon, a registry, or a network — which matters, because this is the code
// that stands between a compromised registry and every property.
//
// It returns a REASON, never a bare boolean. "The update did not install" is
// an operator support call; "refused: signed by an untrusted key" is an
// incident report.
import type { SignatureStatus } from "./signature.js";
import { signaturePermitsSwap } from "./signature.js";

export const RINGS = ["canary", "early", "general"] as const;
export type Ring = typeof RINGS[number];

/**
 * Rings are ordered by exposure. A release marked available for `canary` has
 * been seen by the fewest properties; one marked `general` has survived the
 * earlier rings.
 *
 * A branch accepts a release only if the release has reached ITS ring —
 * a `general` property ignores a canary-only release. That is the whole
 * mechanism: a bad build is found on one site instead of all of them.
 */
const RING_ORDER: Record<Ring, number> = { canary: 0, early: 1, general: 2 };

export function isRing(value: string): value is Ring {
  return (RINGS as readonly string[]).includes(value);
}

export interface ReleaseDescriptor {
  /** What was asked for: a channel name or an explicit tag. */
  requestedRef: string;
  /** Resolved content address. Pulls happen by this, never by tag. */
  digest: string;
  /**
   * How far this release has been PROMOTED. A release starts at `canary` and
   * is moved outward — `canary` → `early` → `general` — as it survives.
   * `canary` therefore means "canary properties only"; `general` means
   * "promoted all the way, everyone may take it".
   */
  availableForRing: Ring;
  /** Schema version the image expects to run against. */
  schemaVersion: number;
  signatureStatus: SignatureStatus;
  signatureKeyId: string | null;
}

export interface BranchState {
  ring: Ring;
  /** Digest currently running, if known. */
  currentDigest: string | null;
  /** The DB's actual schema version right now. */
  dbSchemaVersion: number;
}

export type RefusalReason =
  | "SIGNATURE_NOT_VERIFIED"
  | "RING_NOT_REACHED"
  | "SCHEMA_DOWNGRADE"
  | "ALREADY_RUNNING"
  | "NO_DIGEST";

export interface PolicyDecision {
  allowed: boolean;
  reason: RefusalReason | null;
  detail: string;
}

/**
 * The complete set of conditions under which a swap may proceed.
 *
 * Order matters for the message the operator sees: signature first, because
 * an untrusted image is a security event and every other reason is
 * housekeeping by comparison.
 */
export function evaluateRelease(release: ReleaseDescriptor, branch: BranchState): PolicyDecision {
  // 1. Signature. No flag skips this and no failure mode passes it.
  if (!signaturePermitsSwap(release.signatureStatus)) {
    return {
      allowed: false,
      reason: "SIGNATURE_NOT_VERIFIED",
      detail: `Refusing ${release.requestedRef}: signature status is "${release.signatureStatus}"`
        + (release.signatureKeyId ? ` (key "${release.signatureKeyId}")` : "")
        + ". Only an image signed by a pinned trusted key may be installed.",
    };
  }

  // 2. A digest is required. Without one there is nothing to pull by, and
  //    falling back to the tag would discard the guarantee the signature
  //    just gave us.
  if (!/^sha256:[a-f0-9]{64}$/.test(release.digest)) {
    return {
      allowed: false, reason: "NO_DIGEST",
      detail: `Refusing ${release.requestedRef}: the tag did not resolve to a content digest.`,
    };
  }

  // 3. Ring. A branch may take a release only once promotion has REACHED it.
  //
  //    The comparison direction is the whole mechanism, and it was inverted
  //    when first written -- a canary-only release would have been accepted
  //    by every property in the estate, which is precisely the blast radius
  //    rings exist to avoid. Caught by the test below, not by review.
  //
  //    A canary branch is EARLIEST, so it accepts everything. A general
  //    branch is last, so it accepts only fully-promoted releases.
  if (RING_ORDER[branch.ring] > RING_ORDER[release.availableForRing]) {
    return {
      allowed: false, reason: "RING_NOT_REACHED",
      detail: `Refusing ${release.requestedRef}: released to "${release.availableForRing}" only, `
        + `and this property is in the "${branch.ring}" ring.`,
    };
  }

  // 4. Schema downgrade. Pairs with B1's future-schema guard from the other
  //    direction: B1 stops an OLD binary opening a NEW database and refusing
  //    to start; this stops us INSTALLING that old binary in the first place.
  //    The database has already been migrated forward and migrations are not
  //    reversible, so an older image cannot read it.
  if (release.schemaVersion < branch.dbSchemaVersion) {
    return {
      allowed: false, reason: "SCHEMA_DOWNGRADE",
      detail: `Refusing ${release.requestedRef}: it expects schema version ${release.schemaVersion} `
        + `but this database is already at ${branch.dbSchemaVersion}. Migrations are not reversible, `
        + `so the older build could not read this data. Restore a pre-upgrade snapshot instead.`,
    };
  }

  // 5. Nothing to do. Not an error — the scheduler asks repeatedly.
  if (branch.currentDigest === release.digest) {
    return {
      allowed: false, reason: "ALREADY_RUNNING",
      detail: `Already running ${release.digest}.`,
    };
  }

  return { allowed: true, reason: null, detail: `${release.requestedRef} → ${release.digest} approved.` };
}

/** A refusal that is a security event, as opposed to routine housekeeping. */
export function isSecurityRefusal(reason: RefusalReason | null): boolean {
  return reason === "SIGNATURE_NOT_VERIFIED" || reason === "NO_DIGEST";
}
