// Backend Blueprint B6 — the tax engine.
//
// The headline is the worked example: ₦50,000 room + 10% service charge +
// 5% consumption tax + 7.5% VAT, computed by hand below and asserted line by
// line. Everything else in this file exists because it is a way the engine
// could be quietly wrong -- an inclusive price that does not add back up, a
// compounding order that silently contributes zero, an exemption that
// suppresses more than it should, a void that reverses the room but leaves
// the VAT standing.
import { test, describe, beforeEach, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import { nanoid } from "nanoid";
import os from "node:os";
import path from "node:path";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const ROOM_50K = 5_000_000; // ₦50,000 in kobo

let orgId: string;
let branchId: string;
let userId: string;

beforeEach(async () => {
  const { db } = await import("../db/client.js");
  const { organizations, branches, users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  orgId = nanoid();
  branchId = nanoid();
  userId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "Tax Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "Tax Branch", createdAt: new Date(),
    currentBusinessDate: utc("2026-05-01"), businessDateRollHour: 3,
  }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId, email: `tax-${userId}@example.com`.toLowerCase(),
    passwordHash: await hashPassword("x"), role: "FIN",
    firstName: "Tax", lastName: "Tester", status: "active", createdAt: new Date(),
  }).run();
});

interface CodeOptions {
  code: string;
  rateBp: number;
  taxType?: string;
  order?: number;
  inclusive?: boolean;
  compoundsOn?: string[];
  appliesTo?: string[];
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
}

async function makeTaxCode(o: CodeOptions): Promise<string> {
  const { db } = await import("../db/client.js");
  const { taxCodes } = await import("../db/schema.js");
  const id = nanoid();
  db.insert(taxCodes).values({
    id, branchId, code: o.code, name: o.code,
    jurisdiction: "federal", taxType: o.taxType ?? "vat",
    rateBp: o.rateBp, isInclusive: o.inclusive ?? false,
    compoundsOnJson: JSON.stringify(o.compoundsOn ?? []),
    appliesToJson: JSON.stringify(o.appliesTo ?? []),
    computationOrder: o.order ?? 100,
    effectiveFrom: o.effectiveFrom ?? new Date(0),
    effectiveTo: o.effectiveTo ?? null,
    isActive: true, createdAt: new Date(),
  }).run();
  return id;
}

/** The blueprint's Nigerian set: service charge first, then the two taxes. */
async function makeNigerianSet() {
  const service = await makeTaxCode({ code: "SC", rateBp: 1_000, taxType: "service_charge", order: 1 });
  // Both taxes compound on the service charge -- it is part of what the
  // guest is billed, so it is part of what is taxed. Neither compounds on
  // the other: federal VAT and a state consumption tax are levied in
  // parallel, not stacked.
  const consumption = await makeTaxCode({ code: "CON", rateBp: 500, taxType: "consumption", order: 2, compoundsOn: [service] });
  const vat = await makeTaxCode({ code: "VAT", rateBp: 750, taxType: "vat", order: 3, compoundsOn: [service] });
  return { service, consumption, vat };
}

describe("the worked example", () => {
  test("₦50,000 room + 10% service + 5% consumption + 7.5% VAT, line by line", async () => {
    const { service, consumption, vat } = await makeNigerianSet();
    const { computeTax } = await import("../services/tax/engine.js");

    const result = computeTax(ROOM_50K, { branchId, chargeCategory: "Room" });

    // ── Hand calculation ────────────────────────────────────────────────
    //   base                                        ₦50,000.00
    //   service charge  10% of 50,000              +  ₦5,000.00
    //   consumption      5% of (50,000 + 5,000)    +  ₦2,750.00
    //   VAT            7.5% of (50,000 + 5,000)    +  ₦4,125.00
    //                                              ─────────────
    //   total                                       ₦61,875.00
    assert.equal(result.baseKobo, 5_000_000, "an exclusive tax never reduces the base");
    assert.equal(result.lines.length, 3);

    const byCode = Object.fromEntries(result.lines.map(l => [l.code, l]));
    assert.equal(byCode.SC.amountKobo, 500_000, "10% of ₦50,000");
    assert.equal(byCode.SC.taxableBaseKobo, 5_000_000);
    assert.equal(byCode.CON.amountKobo, 275_000, "5% of ₦55,000");
    assert.equal(byCode.CON.taxableBaseKobo, 5_500_000, "the service charge is in the base");
    assert.equal(byCode.VAT.amountKobo, 412_500, "7.5% of ₦55,000");
    assert.equal(byCode.VAT.taxableBaseKobo, 5_500_000);

    assert.equal(result.taxTotalKobo, 1_187_500);
    assert.equal(result.totalKobo, 6_187_500, "₦61,875.00");

    // Order is not incidental: it is what makes compounding produce these
    // numbers rather than different ones.
    assert.deepEqual(result.lines.map(l => l.taxCodeId), [service, consumption, vat]);
    // A service charge is the property's own revenue, not tax held for the
    // state, so it posts as its own kind.
    assert.equal(byCode.SC.chargeKind, "service_charge");
    assert.equal(byCode.VAT.chargeKind, "tax");
  });
});

describe("inclusive tax", () => {
  test("back-computation round-trips: base + tax equals the price shown", async () => {
    await makeTaxCode({ code: "VAT", rateBp: 750, inclusive: true });
    const { computeTax } = await import("../services/tax/engine.js");

    const result = computeTax(ROOM_50K, { branchId, chargeCategory: "Room" });

    // ₦50,000 quoted inclusive of 7.5%: base = 50,000 x 10000/10750.
    assert.equal(result.baseKobo, 4_651_163, "₦46,511.63");
    assert.equal(result.taxTotalKobo, 348_837, "₦3,488.37");
    assert.equal(result.totalKobo, ROOM_50K, "the guest pays exactly the price they were quoted");
  });

  test("adds back up exactly for every amount from ₦0.01 to ₦100.00", async () => {
    await makeTaxCode({ code: "VAT", rateBp: 750, inclusive: true });
    const { computeTax } = await import("../services/tax/engine.js");

    // Exhaustive over a range small enough to enumerate. The property that
    // matters is not that the split is any particular pair of numbers, but
    // that it always sums back to what the operator typed -- an inclusive
    // price that comes back a kobo different is a guest at the desk asking
    // why the bill is not the number on the rate card.
    for (let amount = 1; amount <= 10_000; amount++) {
      const result = computeTax(amount, { branchId, chargeCategory: "Room" });
      assert.equal(
        result.baseKobo + result.taxTotalKobo, amount,
        `inclusive split of ${amount} kobo must sum back to ${amount}`,
      );
    }
  });

  test("stays exact when an inclusive tax compounds on a service charge", async () => {
    // The case where the closed-form formula stops being exact: the
    // aggregate rate is no longer a whole number of basis points. The
    // solver's job is that this makes no difference to the guest.
    const service = await makeTaxCode({ code: "SC", rateBp: 1_000, taxType: "service_charge", order: 1, inclusive: true });
    await makeTaxCode({ code: "VAT", rateBp: 750, order: 2, inclusive: true, compoundsOn: [service] });
    const { computeTax } = await import("../services/tax/engine.js");

    for (const amount of [1, 7, 99, 12_345, 5_000_000, 987_654_321]) {
      const result = computeTax(amount, { branchId, chargeCategory: "Room" });
      assert.equal(result.baseKobo + result.taxTotalKobo, amount, `compound inclusive split of ${amount}`);
      assert.equal(result.totalKobo, amount);
    }
  });
});

describe("compounding", () => {
  test("changing what a tax compounds on changes the total, by exactly the expected amount", async () => {
    const service = await makeTaxCode({ code: "SC", rateBp: 1_000, taxType: "service_charge", order: 1 });
    const vatId = await makeTaxCode({ code: "VAT", rateBp: 750, order: 2 });
    const { computeTax } = await import("../services/tax/engine.js");
    const { db } = await import("../db/client.js");
    const { taxCodes } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    // Not compounding: VAT is 7.5% of the room alone.
    const flat = computeTax(ROOM_50K, { branchId, chargeCategory: "Room" });
    assert.equal(flat.totalKobo, 5_000_000 + 500_000 + 375_000);

    db.update(taxCodes).set({ compoundsOnJson: JSON.stringify([service]) }).where(eq(taxCodes.id, vatId)).run();

    // Compounding: VAT is 7.5% of the room AND the service charge.
    const compounded = computeTax(ROOM_50K, { branchId, chargeCategory: "Room" });
    assert.equal(compounded.totalKobo, 5_000_000 + 500_000 + 412_500);
    assert.equal(
      compounded.totalKobo - flat.totalKobo, 37_500,
      "the difference is exactly 7.5% of the ₦5,000 service charge",
    );
  });

  test("a tax only applies to the categories it names", async () => {
    await makeTaxCode({ code: "VAT", rateBp: 750 });                              // all categories
    await makeTaxCode({ code: "CON", rateBp: 500, appliesTo: ["Room", "Restaurant"] });
    const { computeTax } = await import("../services/tax/engine.js");

    const room = computeTax(ROOM_50K, { branchId, chargeCategory: "Room" });
    assert.deepEqual(room.lines.map(l => l.code).sort(), ["CON", "VAT"]);

    const laundry = computeTax(ROOM_50K, { branchId, chargeCategory: "Laundry" });
    assert.deepEqual(laundry.lines.map(l => l.code), ["VAT"], "consumption tax does not reach laundry");
  });
});

describe("exemptions", () => {
  test("suppress only the exempted code, never the rest", async () => {
    const { vat } = await makeNigerianSet();
    const { db } = await import("../db/client.js");
    const { taxExemptions } = await import("../db/schema.js");
    const { computeTax } = await import("../services/tax/engine.js");

    db.insert(taxExemptions).values({
      id: nanoid(), branchId, taxCodeId: vat, exemptionType: "diplomatic",
      criteriaJson: "{}", requiresEvidence: true, isActive: true, createdAt: new Date(),
    }).run();

    // Without the claim, nothing changes -- an exemption is not automatic.
    const normal = computeTax(ROOM_50K, { branchId, chargeCategory: "Room" });
    assert.equal(normal.lines.length, 3);

    const exempt = computeTax(ROOM_50K, {
      branchId, chargeCategory: "Room", exemptionTypes: ["diplomatic"],
    });
    assert.deepEqual(exempt.lines.map(l => l.code), ["SC", "CON"], "VAT is gone; service charge and consumption stay");
    assert.deepEqual(exempt.exemptedCodeIds, [vat]);
    assert.equal(exempt.totalKobo, 5_000_000 + 500_000 + 275_000);
  });

  test("a long-stay exemption applies from the stay itself, without anyone claiming it", async () => {
    const vat = await makeTaxCode({ code: "VAT", rateBp: 750 });
    const { db } = await import("../db/client.js");
    const { taxExemptions } = await import("../db/schema.js");
    const { computeTax } = await import("../services/tax/engine.js");

    db.insert(taxExemptions).values({
      id: nanoid(), branchId, taxCodeId: vat, exemptionType: "long_stay",
      criteriaJson: JSON.stringify({ minNights: 30 }), requiresEvidence: false,
      isActive: true, createdAt: new Date(),
    }).run();

    const short = computeTax(ROOM_50K, { branchId, chargeCategory: "Room", nights: 29 });
    assert.equal(short.lines.length, 1, "29 nights is not a long stay");

    const long = computeTax(ROOM_50K, { branchId, chargeCategory: "Room", nights: 30 });
    assert.equal(long.lines.length, 0, "30 nights qualifies without a clerk ticking a box");
    assert.equal(long.totalKobo, ROOM_50K);
  });
});

describe("rounding", () => {
  test("1,000 random amounts: every line is correctly rounded, and the aggregate drift is bounded and measured", async () => {
    await makeTaxCode({ code: "VAT", rateBp: 750 });
    const { computeTax } = await import("../services/tax/engine.js");

    // Deterministic, so a failure is reproducible -- but NOT a plain LCG.
    // The first version of this test used `(seed * 1103515245 + 12345) % 2^31`
    // and read its low bits, which is the textbook weakness of that
    // generator: the sample it produced never once hit an amount whose tax
    // lands exactly on a half kobo (0 in 1,000, against ~25 expected), and
    // its drift came out at 73 kobo -- eight standard deviations out, from
    // the generator rather than from the engine. mulberry32 distributes the
    // residues properly.
    const mulberry32 = (a: number) => () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
    const random = mulberry32(20260801);

    let perLineTotal = 0;
    let sumOfAmounts = 0;
    let exactHalves = 0;

    for (let i = 0; i < 1_000; i++) {
      const amount = 1 + Math.floor(random() * 10_000_000); // ₦0.01 .. ₦100,000
      const result = computeTax(amount, { branchId, chargeCategory: "Room" });

      // Each line is exactly the correctly-rounded 7.5% of its own base.
      const exact = (amount * 750) / 10_000;
      const expected = exact < 0 ? -Math.round(-exact) : Math.round(exact);
      assert.equal(result.taxTotalKobo, expected, `tax on ${amount} kobo`);

      if (Math.abs(exact - Math.trunc(exact) - 0.5) < 1e-9) exactHalves += 1;
      perLineTotal += result.taxTotalKobo;
      sumOfAmounts += amount;
    }

    // The sample has to actually contain the rounding decision being tested.
    // 7.5% lands on an exact half kobo whenever the amount is 20 mod 40, so
    // ~1 in 40 -- roughly 25 of 1,000.
    assert.ok(exactHalves >= 10, `sample must exercise the half-kobo tie case; got ${exactHalves}`);

    const drift = perLineTotal - Math.round((sumOfAmounts * 750) / 10_000);

    // THE DOCUMENTED DISCREPANCY. The blueprint asks for these to agree
    // "within one kobo". They cannot, and the reason is worth stating
    // rather than tuning a threshold until it passes:
    //
    //   - 1,000 independent roundings each move by up to half a kobo, so
    //     the ARITHMETIC bound is 500 kobo, not 1.
    //   - Non-tie roundings are symmetric and cancel: σ ≈ √1000 / √12 ≈ 9.
    //   - The ~25 exact-half cases are NOT symmetric. mulRate rounds half
    //     away from zero (so that a reversal is the exact negative of the
    //     charge it undoes -- see money.ts), which biases the total up by
    //     half a kobo each: ≈ +12 kobo expected.
    //
    // So the expected drift is around +12 ± 9, and this bound is roughly
    // ten sigma out from that. The measured value at this seed is +11.
    //
    // What matters for a folio is the per-line assertion above: every guest
    // is charged the correctly rounded tax on their own charge. Nobody is
    // ever billed the aggregate, and no folio is ever a kobo out.
    assert.ok(Math.abs(drift) <= 500, `drift ${drift} kobo exceeds the 1,000 x 0.5 kobo arithmetic bound`);
    assert.ok(Math.abs(drift) <= 100, `drift ${drift} kobo — expected ≈ +12 ± 9 from half-kobo tie rounding`);
  });
});

describe("effective dating", () => {
  test("a rate change does not alter what a past date computes to", async () => {
    await makeTaxCode({ code: "VAT", rateBp: 750, effectiveFrom: new Date(0), effectiveTo: utc("2026-06-01") });
    await makeTaxCode({ code: "VAT2", rateBp: 1_000, effectiveFrom: utc("2026-06-01") });
    const { computeTax } = await import("../services/tax/engine.js");

    const may = computeTax(ROOM_50K, { branchId, chargeCategory: "Room", on: at("2026-05-15") });
    assert.deepEqual(may.lines.map(l => l.code), ["VAT"]);
    assert.equal(may.taxTotalKobo, 375_000, "7.5%");

    const june = computeTax(ROOM_50K, { branchId, chargeCategory: "Room", on: at("2026-06-15") });
    assert.deepEqual(june.lines.map(l => l.code), ["VAT2"]);
    assert.equal(june.taxTotalKobo, 500_000, "10%");
  });
});

describe("posting", () => {
  async function makeStay(rateKobo = ROOM_50K, checkIn = "2026-05-01", checkOut = "2026-05-04") {
    const { db } = await import("../db/client.js");
    const { guests, rooms, reservations } = await import("../db/schema.js");
    const roomId = nanoid();
    db.insert(rooms).values({ id: roomId, branchId, number: `T${Math.floor(Math.random() * 1_000_000)}`, type: "Standard" }).run();
    const guestId = nanoid();
    db.insert(guests).values({ id: guestId, branchId, firstName: "Tax", lastName: "Guest", vip: false, blacklisted: false, createdAt: new Date() }).run();
    const id = nanoid();
    db.insert(reservations).values({
      id, branchId, guestId, roomId, status: "checked_in",
      checkInDate: utc(checkIn), checkOutDate: utc(checkOut),
      rateKobo, createdBy: userId, createdAt: utc(checkIn),
    }).run();
    return { reservationId: id, roomId };
  }

  test("a room charge posts as a base row plus separate tax rows, never a blended number", async () => {
    await makeNigerianSet();
    const { reservationId } = await makeStay();
    const { postRoomChargeForNight } = await import("../services/nightAudit/roomCharges.js");
    const { folioSummary } = await import("../services/folio.js");

    const posted = postRoomChargeForNight(reservationId, utc("2026-05-01"), userId)!;
    assert.ok(posted);

    const folio = folioSummary(reservationId);
    assert.equal(folio.charges.length, 4, "1 base + 3 tax/service lines");

    const base = folio.charges.find(c => c.chargeKind === "base")!;
    assert.equal(base.amountKobo, 5_000_000);
    assert.equal(base.parentChargeId, null);

    const children = folio.charges.filter(c => c.parentChargeId === base.id);
    assert.equal(children.length, 3, "every tax line points at the charge it taxes");
    for (const child of children) assert.ok(child.taxCodeId, "a tax line names the code that produced it");

    assert.equal(folio.totalNetKobo, 5_000_000);
    assert.equal(folio.totalServiceChargeKobo, 500_000);
    assert.equal(folio.totalTaxKobo, 687_500, "consumption ₦2,750 + VAT ₦4,125");
    assert.equal(folio.totalChargesKobo, 6_187_500, "the folio balance is the guest's real total");
    assert.equal(folio.balanceKobo, 6_187_500);
  });

  test("re-running the same night posts nothing further -- tax lines do not break idempotency", async () => {
    await makeNigerianSet();
    const { reservationId } = await makeStay();
    const { postRoomChargeForNight } = await import("../services/nightAudit/roomCharges.js");
    const { folioSummary } = await import("../services/folio.js");

    assert.ok(postRoomChargeForNight(reservationId, utc("2026-05-01"), userId));
    const afterFirst = folioSummary(reservationId).totalChargesKobo;

    assert.equal(postRoomChargeForNight(reservationId, utc("2026-05-01"), userId), null);
    assert.equal(folioSummary(reservationId).totalChargesKobo, afterFirst, "no double charge, no orphan tax line");
  });
});

describe("voids", () => {
  async function postedRoomNight() {
    const { db } = await import("../db/client.js");
    const { guests, rooms, reservations } = await import("../db/schema.js");
    const roomId = nanoid();
    db.insert(rooms).values({ id: roomId, branchId, number: `V${Math.floor(Math.random() * 1_000_000)}`, type: "Standard" }).run();
    const guestId = nanoid();
    db.insert(guests).values({ id: guestId, branchId, firstName: "Void", lastName: "Guest", vip: false, blacklisted: false, createdAt: new Date() }).run();
    const reservationId = nanoid();
    db.insert(reservations).values({
      id: reservationId, branchId, guestId, roomId, status: "checked_in",
      checkInDate: utc("2026-05-01"), checkOutDate: utc("2026-05-04"),
      rateKobo: ROOM_50K, createdBy: userId, createdAt: utc("2026-05-01"),
    }).run();

    const { postRoomChargeForNight } = await import("../services/nightAudit/roomCharges.js");
    const posted = postRoomChargeForNight(reservationId, utc("2026-05-01"), userId)!;
    return { reservationId, chargeId: posted.chargeId };
  }

  test("a full void reverses the tax with the charge, and the folio returns to exactly zero", async () => {
    await makeNigerianSet();
    const { reservationId, chargeId } = await postedRoomNight();
    const { voidFolioCharge } = await import("../services/ledger.js");
    const { transaction } = await import("../db/tx.js");
    const { folioSummary } = await import("../services/folio.js");

    assert.equal(folioSummary(reservationId).balanceKobo, 6_187_500);

    const result = transaction(() => voidFolioCharge(chargeId, {
      reasonCode: "posting_error", actorUserId: userId, branchId,
    }));

    assert.equal(result.fullyVoided, true);
    assert.equal(result.taxReversalIds?.length, 3, "all three lines reversed alongside the base");
    assert.equal(result.taxReversedKobo, 1_187_500);
    assert.equal(
      folioSummary(reservationId).balanceKobo, 0,
      "reversing only the base would leave the guest owing tax on a charge that no longer exists",
    );
  });

  test("a partial void reverses the tax in proportion", async () => {
    await makeTaxCode({ code: "VAT", rateBp: 750 });
    const { reservationId, chargeId } = await postedRoomNight();
    const { voidFolioCharge } = await import("../services/ledger.js");
    const { transaction } = await import("../db/tx.js");
    const { folioSummary } = await import("../services/folio.js");

    // ₦50,000 + ₦3,750 VAT = ₦53,750.
    assert.equal(folioSummary(reservationId).balanceKobo, 5_375_000);

    // Reverse three fifths of the base: ₦30,000.
    const result = transaction(() => voidFolioCharge(chargeId, {
      reasonCode: "guest_dispute", amountKobo: 3_000_000, actorUserId: userId, branchId,
    }));

    assert.equal(result.fullyVoided, false);
    assert.equal(result.taxReversedKobo, 225_000, "three fifths of ₦3,750");
    assert.equal(folioSummary(reservationId).balanceKobo, 2_000_000 + 150_000, "₦20,000 + its ₦1,500 VAT");
  });

  test("repeated partial voids still land on exactly zero", async () => {
    // The rounding trap: three uneven partial voids of a charge whose tax
    // does not divide cleanly. The last one has to sweep the remainder or a
    // kobo of tax is stranded on a fully-reversed charge forever.
    await makeTaxCode({ code: "VAT", rateBp: 750 });
    const { reservationId, chargeId } = await postedRoomNight();
    const { voidFolioCharge } = await import("../services/ledger.js");
    const { transaction } = await import("../db/tx.js");
    const { folioSummary } = await import("../services/folio.js");

    for (const amount of [1_666_667, 1_666_667, undefined]) {
      transaction(() => voidFolioCharge(chargeId, {
        reasonCode: "posting_error", amountKobo: amount, actorUserId: userId, branchId,
      }));
    }
    assert.equal(folioSummary(reservationId).balanceKobo, 0);
  });

  test("a tax line cannot be voided on its own", async () => {
    await makeTaxCode({ code: "VAT", rateBp: 750 });
    const { reservationId, chargeId } = await postedRoomNight();
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { voidFolioCharge } = await import("../services/ledger.js");
    const { transaction } = await import("../db/tx.js");

    const taxLine = db.select().from(folioCharges).where(eq(folioCharges.parentChargeId, chargeId)).get()!;

    assert.throws(
      () => transaction(() => voidFolioCharge(taxLine.id, {
        reasonCode: "posting_error", actorUserId: userId, branchId,
      })),
      // Voiding the VAT alone would leave the room charge standing untaxed,
      // which is a different bill from the one the guest agreed to.
      (err: any) => err.code === "CANNOT_VOID_TAX_LINE_DIRECTLY",
    );
    void reservationId;
  });
});

describe("the settings endpoints", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = await import("../app.js");
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("Failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  });

  async function loginAs(role: string) {
    const { db } = await import("../db/client.js");
    const { users } = await import("../db/schema.js");
    const { hashPassword } = await import("../auth/passwords.js");
    const id = nanoid();
    const email = `tax-http-${id}@example.com`.toLowerCase();
    db.insert(users).values({
      id, organizationId: orgId, branchId, email, role,
      passwordHash: await hashPassword("correct-password"),
      firstName: "Tax", lastName: "User", status: "active", createdAt: new Date(),
    }).run();
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-password" }),
    });
    assert.equal(res.status, 200, `login should succeed for ${role}`);
    return res.headers.get("set-cookie")!.split(";")[0];
  }

  const loginAsFinance = () => loginAs("FIN");

  test("the worked-example endpoint matches the hand calculation", async () => {
    await makeNigerianSet();
    const cookie = await loginAsFinance();

    const res = await fetch(`${baseUrl}/settings/tax-codes/preview`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ amountKobo: ROOM_50K, chargeCategory: "Room" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;

    // The same ₦61,875.00 computed by hand at the top of this file, this
    // time through HTTP -- which is what the configuration screen will show
    // whoever is setting the rates up.
    assert.equal(body.totalKobo, 6_187_500);
    assert.equal(body.display.total, "₦61,875.00");
    assert.deepEqual(body.display.lines.map((l: any) => [l.code, l.rate, l.amount]), [
      ["SC", "10%", "₦5,000.00"],
      ["CON", "5%", "₦2,750.00"],
      ["VAT", "7.5%", "₦4,125.00"],
    ]);
  });

  test("saving the property's tax rate now persists AND takes effect", async () => {
    // IT, not Finance: the Hotel Configuration screen is property setup and
    // is gated on settings:branch. Finance configures tax through
    // /settings/tax-codes instead. IT holds both grants.
    const cookie = await loginAs("IT");

    // Both halves of the bug this batch fixed: the rate used to be dropped
    // on the way to the database (percent field, basis-point column), and
    // even when stored it was never applied to anything.
    const save = await fetch(`${baseUrl}/settings/branch`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ taxName: "VAT", taxRate: 7.5, taxInclusive: false }),
    });
    assert.equal(save.status, 200);
    const saved = await save.json() as any;
    assert.equal(saved.taxRate, 7.5, "the rate reads back as what was saved, not the old value");
    assert.equal(saved.taxRateBp, 750, "stored as basis points");

    const { computeTax } = await import("../services/tax/engine.js");
    const computed = computeTax(ROOM_50K, { branchId, chargeCategory: "Room" });
    assert.equal(computed.taxTotalKobo, 375_000, "the setting is what a guest is actually charged");

    // Changing it moves the charge with it.
    await fetch(`${baseUrl}/settings/branch`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ taxRate: 10 }),
    });
    assert.equal(computeTax(ROOM_50K, { branchId, chargeCategory: "Room" }).taxTotalKobo, 500_000);
  });

  test("a rate change opens a new code instead of rewriting the old one", async () => {
    const cookie = await loginAsFinance();
    const created = await fetch(`${baseUrl}/settings/tax-codes`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        code: "VAT", name: "VAT", jurisdiction: "federal", taxType: "vat",
        rateBp: 750, effectiveFrom: "2026-01-01T00:00:00.000Z",
      }),
    });
    assert.equal(created.status, 201);
    const original = await created.json() as any;

    const patched = await fetch(`${baseUrl}/settings/tax-codes/${original.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ rateBp: 1_000, effectiveFrom: "2026-06-01T00:00:00.000Z" }),
    });
    assert.equal(patched.status, 200);
    const replacement = await patched.json() as any;
    assert.notEqual(replacement.id, original.id, "a rate change is a new row");
    assert.equal(replacement.supersededId, original.id);

    // The old rate still governs the days it governed -- which is what makes
    // reprinting a May invoice produce the number the guest actually paid.
    const { computeTax } = await import("../services/tax/engine.js");
    assert.equal(computeTax(ROOM_50K, { branchId, chargeCategory: "Room", on: at("2026-05-15") }).taxTotalKobo, 375_000);
    assert.equal(computeTax(ROOM_50K, { branchId, chargeCategory: "Room", on: at("2026-06-15") }).taxTotalKobo, 500_000);
  });

  test("a tax code added today applies to today's charges", async () => {
    // FOUND IN LIVE VERIFICATION, NOT BY A TEST. effectiveFrom used to
    // default to the wall clock, but charges are effective-dated against the
    // business date -- midnight of the trading day. A code created at 11:32
    // was therefore stamped later than every charge posted that same day, so
    // adding a service charge and immediately posting a charge produced no
    // service charge at all, with nothing on screen to explain it.
    const cookie = await loginAsFinance();
    const res = await fetch(`${baseUrl}/settings/tax-codes`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        code: "SC", name: "Service Charge", jurisdiction: "local",
        taxType: "service_charge", rateBp: 1_000, computationOrder: 1,
      }),
    });
    assert.equal(res.status, 201);

    const { computeTax } = await import("../services/tax/engine.js");
    const { currentBusinessDate } = await import("../lib/businessDate.js");
    const computed = computeTax(ROOM_50K, {
      branchId, chargeCategory: "Room", on: currentBusinessDate(branchId),
    });
    assert.deepEqual(computed.lines.map(l => l.code), ["SC"], "the code applies to the trading day it was added on");
    assert.equal(computed.totalKobo, 5_500_000);
  });

  test("back-dating a rate change is refused", async () => {
    const cookie = await loginAsFinance();
    const created = await fetch(`${baseUrl}/settings/tax-codes`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        code: "VAT", name: "VAT", jurisdiction: "federal", taxType: "vat",
        rateBp: 750, effectiveFrom: "2026-03-01T00:00:00.000Z",
      }),
    });
    const original = await created.json() as any;

    const res = await fetch(`${baseUrl}/settings/tax-codes/${original.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ rateBp: 1_000, effectiveFrom: "2026-01-01T00:00:00.000Z" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "TAX_RATE_CHANGE_BACKDATED");
  });

  test("a tax cannot compound on one computed after it", async () => {
    const cookie = await loginAsFinance();
    const later = await fetch(`${baseUrl}/settings/tax-codes`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ code: "LATE", name: "Late", jurisdiction: "state", taxType: "other", rateBp: 500, computationOrder: 90 }),
    });
    const lateCode = await later.json() as any;

    // Order 50 comes first, so it cannot include order 90's amount in its
    // base -- the engine is a single forward pass, and a backward reference
    // would silently contribute zero rather than fail loudly.
    const res = await fetch(`${baseUrl}/settings/tax-codes`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        code: "EARLY", name: "Early", jurisdiction: "federal", taxType: "vat",
        rateBp: 750, computationOrder: 50, compoundsOn: [lateCode.id],
      }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "TAX_CODE_COMPOUND_ORDER");
  });

  test("editing property settings does not carry the right to change the tax rate", async () => {
    // A custom role with settings:branch but NOT settings:tax -- exactly the
    // role someone would create for "can edit the property details". Before
    // B6 that grant would have let them change the VAT rate as a side effect
    // of a screen that is otherwise about check-in times and phone numbers.
    const ownerCookie = await loginAs("ORG");
    const roleRes = await fetch(`${baseUrl}/hr/roles`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: `Property Editor ${nanoid(6)}`, permissions: ["settings:branch"] }),
    });
    assert.equal(roleRes.status, 201);
    const { id: roleId } = await roleRes.json() as { id: string };
    const cookie = await loginAs(roleId);

    // The non-tax half of the same screen still saves fine.
    const ordinary = await fetch(`${baseUrl}/settings/branch`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ checkOutTime: "12:00" }),
    });
    assert.equal(ordinary.status, 200);

    const taxEdit = await fetch(`${baseUrl}/settings/branch`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ taxRate: 15 }),
    });
    assert.equal(taxEdit.status, 403);
    assert.equal((await taxEdit.json() as any).required, "settings:tax");
  });

  test("front desk cannot configure tax", async () => {
    const { db } = await import("../db/client.js");
    const { users } = await import("../db/schema.js");
    const { hashPassword } = await import("../auth/passwords.js");
    const id = nanoid();
    const email = `tax-fd-${id}@example.com`.toLowerCase();
    db.insert(users).values({
      id, organizationId: orgId, branchId, email, role: "FD",
      passwordHash: await hashPassword("correct-password"),
      firstName: "Front", lastName: "Desk", status: "active", createdAt: new Date(),
    }).run();
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-password" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];

    const res = await fetch(`${baseUrl}/settings/tax-codes`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 403, "a tax rate is a financial control, not a front-desk one");
  });
});

describe("the night audit with tax", () => {
  test("revenue is net of tax, tax_collected is populated, and the day reconciles", async () => {
    await makeNigerianSet();
    const { db } = await import("../db/client.js");
    const { guests, rooms, reservations, dailyRevenue, folioCharges } = await import("../db/schema.js");
    const { and, eq } = await import("drizzle-orm");

    // Two rooms sold for one night at ₦50,000 and ₦30,000.
    for (const rate of [5_000_000, 3_000_000]) {
      const roomId = nanoid();
      db.insert(rooms).values({ id: roomId, branchId, number: `A${Math.floor(Math.random() * 1_000_000)}`, type: "Standard" }).run();
      const guestId = nanoid();
      db.insert(guests).values({ id: guestId, branchId, firstName: "Audit", lastName: "Guest", vip: false, blacklisted: false, createdAt: new Date() }).run();
      db.insert(reservations).values({
        id: nanoid(), branchId, guestId, roomId, status: "checked_in",
        checkInDate: utc("2026-05-01"), checkOutDate: utc("2026-05-02"),
        rateKobo: rate, createdBy: userId, createdAt: utc("2026-05-01"),
      }).run();
    }

    const { runNightAudit } = await import("../services/nightAudit/index.js");
    runNightAudit(branchId, { now: at("2026-05-01"), operatorUserId: userId });

    const day = db.select().from(dailyRevenue).where(and(
      eq(dailyRevenue.branchId, branchId), eq(dailyRevenue.businessDate, utc("2026-05-01")),
    )).get()!;

    // Net room revenue: ₦50,000 + ₦30,000 = ₦80,000, plus the service charge
    // (₦8,000), which is the property's own revenue and not held for anyone.
    assert.equal(day.roomRevenueKobo, 8_000_000 + 800_000);
    // Tax held for the state: 5% + 7.5% of ₦88,000 = ₦4,400 + ₦6,600.
    assert.equal(day.taxCollectedKobo, 440_000 + 660_000);
    assert.equal(
      day.adrKobo, Math.round(8_800_000 / 2),
      "ADR is computed on revenue, not on money the property is holding for FIRS",
    );

    // The frozen day ties back to the ledger, split the same way.
    const reservationIds = new Set(
      db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id),
    );
    const nightCharges = db.select().from(folioCharges)
      .where(eq(folioCharges.businessDate, utc("2026-05-01"))).all()
      .filter(c => reservationIds.has(c.reservationId));

    const ledgerRevenue = nightCharges.filter(c => c.chargeKind !== "tax").reduce((s, c) => s + c.amountKobo, 0);
    const ledgerTax = nightCharges.filter(c => c.chargeKind === "tax").reduce((s, c) => s + c.amountKobo, 0);
    assert.equal(day.roomRevenueKobo, ledgerRevenue);
    assert.equal(day.taxCollectedKobo, ledgerTax);
    // And nothing fell between the two buckets.
    assert.equal(
      ledgerRevenue + ledgerTax,
      nightCharges.reduce((s, c) => s + c.amountKobo, 0),
      "every posted kobo is either revenue or tax",
    );
  });
});
