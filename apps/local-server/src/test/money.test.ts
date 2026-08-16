// Backend Blueprint B2 — money arithmetic.
//
// The headline case is the property test: 10,000 random charge/payment
// sequences must reconcile with *zero* drift. That is the whole reason the
// batch exists, so it is written to actually be capable of failing -- it
// compares against an independent integer oracle, and separately
// demonstrates that the float implementation it replaces does drift on the
// same data.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import {
  toKobo, fromKobo, formatNaira, addKobo, subKobo, mulKobo, mulRate, valueKobo,
  splitKobo, parseNairaInput, percentToBasisPoints, basisPointsToPercent,
  MoneyError,
} from "../lib/money.js";

describe("toKobo / fromKobo", () => {
  test("handles the float representation traps that motivated this batch", () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE-754.
    assert.equal(toKobo(19.99), 1999);
    // 1.005 * 100 is 100.49999999999999, so a naive Math.round gives 100.
    assert.equal(toKobo(1.005), 101);
    assert.equal(toKobo(0.1), 10);
    assert.equal(toKobo(0.2), 20);
    assert.equal(toKobo(0.3), 30);
    assert.equal(toKobo(1234.56), 123456);
    assert.equal(toKobo(0), 0);
    assert.equal(toKobo(-19.99), -1999);
  });

  test("round-trips through fromKobo", () => {
    for (const naira of [0, 0.01, 1, 19.99, 1234.56, 999999.99, -45.5]) {
      assert.equal(fromKobo(toKobo(naira)), naira);
    }
  });

  test("fromKobo refuses a non-integer, rather than quietly halving a bug", () => {
    assert.throws(() => fromKobo(10.5), MoneyError);
  });
});

describe("addKobo / subKobo / mulKobo", () => {
  test("are exact where floats are not", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in kobo it is just 30.
    assert.equal(addKobo(10, 20), 30);
    assert.notEqual(0.1 + 0.2, 0.3); // the thing we are avoiding
    assert.equal(addKobo(), 0);
    assert.equal(subKobo(10000, 2500), 7500);
    assert.equal(subKobo(2500, 10000), -7500, "negative results are legitimate (credits)");
    assert.equal(mulKobo(1999, 3), 5997);
  });

  test("reject non-integer inputs loudly", () => {
    assert.throws(() => addKobo(10.5), MoneyError);
    assert.throws(() => subKobo(1.1, 1), MoneyError);
    assert.throws(() => mulKobo(100, 1.5), MoneyError);
    assert.throws(() => addKobo(NaN), MoneyError);
    assert.throws(() => addKobo(Infinity), MoneyError);
  });
});

describe("mulRate", () => {
  test("computes ordinary rates correctly", () => {
    assert.equal(mulRate(100000, 750), 7500, "7.5% VAT on ₦1,000");
    assert.equal(mulRate(100000, 1000), 10000, "10% service charge");
    assert.equal(mulRate(100000, 500), 5000, "5% consumption tax");
    assert.equal(mulRate(0, 750), 0);
    assert.equal(mulRate(100000, 0), 0);
  });

  test("rounds half away from zero at the boundary", () => {
    // 100 kobo * 750bp = 7.5 kobo exactly -> 8
    assert.equal(mulRate(100, 750), 8);
    // symmetry is the point: a reversal must undo its original exactly
    assert.equal(mulRate(-100, 750), -8);
    assert.equal(mulRate(100, 750) + mulRate(-100, 750), 0);
    // 1550 * 750 / 10000 = 116.25 -> 116
    assert.equal(mulRate(1550, 750), 116);
    // 50 * 100 / 10000 = 0.5 -> 1
    assert.equal(mulRate(50, 100), 1);
    assert.equal(mulRate(-50, 100), -1);
  });

  test("reversal symmetry holds across many random amounts", () => {
    for (let i = 0; i < 2000; i++) {
      const amount = Math.floor(Math.random() * 10_000_000);
      const bp = Math.floor(Math.random() * 2500);
      assert.equal(
        mulRate(amount, bp) + mulRate(-amount, bp), 0,
        `tax on +${amount} and -${amount} at ${bp}bp must cancel exactly`,
      );
    }
  });

  test("rejects a fractional rate", () => {
    assert.throws(() => mulRate(100000, 7.5), MoneyError);
  });
});

describe("valueKobo", () => {
  test("is exact for integer quantities", () => {
    assert.equal(valueKobo(199900, 3), 599700, "3 nights at ₦1,999");
    assert.equal(valueKobo(0, 5), 0);
    assert.equal(valueKobo(100, 0), 0);
  });

  test("handles the fractional stock quantities that forced it to exist", () => {
    // 2.5 kg at ₦100.00/kg
    assert.equal(valueKobo(10000, 2.5), 25000);
    // 0.333 kg at ₦100.01/kg = 3330.333 kobo -> 3330
    assert.equal(valueKobo(10001, 0.333), 3330);
    assert.equal(valueKobo(10000, 0.5), 5000);
  });

  test("rounds half away from zero, matching mulRate", () => {
    // 100 kobo x 1.005 = 100.5 -> 101
    assert.equal(valueKobo(100, 1.005), 101);
    assert.equal(valueKobo(-100, 1.005), -101);
    assert.equal(valueKobo(100, 1.005) + valueKobo(-100, 1.005), 0);
  });

  test("rejects a non-finite quantity", () => {
    assert.throws(() => valueKobo(100, NaN), MoneyError);
    assert.throws(() => valueKobo(100, Infinity), MoneyError);
  });

  test("always returns whole kobo", () => {
    for (let i = 0; i < 3000; i++) {
      const unit = Math.floor(Math.random() * 1_000_000);
      const qty = Math.round(Math.random() * 10000) / 100; // 2dp quantities
      assert.ok(Number.isInteger(valueKobo(unit, qty)), `valueKobo(${unit}, ${qty}) must be integral`);
    }
  });
});

describe("splitKobo", () => {
  test("the blueprint case: splitKobo(10001, 3) sums to 10001", () => {
    const parts = splitKobo(10001, 3);
    assert.deepEqual(parts, [3334, 3334, 3333]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 10001);
  });

  test("parts always sum to the input, for many random splits", () => {
    for (let i = 0; i < 5000; i++) {
      const amount = Math.floor(Math.random() * 1_000_000) - 500_000; // include negatives
      const parts = Math.floor(Math.random() * 12) + 1;
      const shares = splitKobo(amount, parts);
      assert.equal(shares.length, parts);
      assert.equal(
        shares.reduce((a, b) => a + b, 0), amount,
        `split of ${amount} into ${parts} must sum back to ${amount}`,
      );
      for (const share of shares) assert.ok(Number.isInteger(share));
    }
  });

  test("handles exact division, single part, and negatives", () => {
    assert.deepEqual(splitKobo(9000, 3), [3000, 3000, 3000]);
    assert.deepEqual(splitKobo(777, 1), [777]);
    assert.deepEqual(splitKobo(-10001, 3), [-3334, -3334, -3333]);
    assert.equal(splitKobo(-10001, 3).reduce((a, b) => a + b, 0), -10001);
  });

  test("rejects a non-positive part count", () => {
    assert.throws(() => splitKobo(1000, 0), MoneyError);
    assert.throws(() => splitKobo(1000, -1), MoneyError);
    assert.throws(() => splitKobo(1000, 2.5), MoneyError);
  });
});

describe("parseNairaInput", () => {
  test("accepts the shapes an operator actually types", () => {
    assert.equal(parseNairaInput("1234.56"), 123456);
    assert.equal(parseNairaInput("₦1,234.56"), 123456);
    assert.equal(parseNairaInput(" 1 234,56 ".replace(",", ".")), 123456);
    assert.equal(parseNairaInput("1,000"), 100000);
    assert.equal(parseNairaInput("0.05"), 5);
    assert.equal(parseNairaInput(".5"), 50);
    assert.equal(parseNairaInput("100."), 10000);
    assert.equal(parseNairaInput("-45.50"), -4550);
    assert.equal(parseNairaInput("+12"), 1200);
  });

  test("rejects more than 2 decimals instead of silently rounding", () => {
    // "10.005" is nearly always a typo or a unit mix-up; rounding it here
    // would make the loss invisible.
    assert.throws(() => parseNairaInput("10.005"), MoneyError);
  });

  test("rejects junk", () => {
    for (const bad of ["", "   ", "abc", "1.2.3", "12abc", "--5", "1e5"]) {
      assert.throws(() => parseNairaInput(bad), MoneyError, `should reject ${JSON.stringify(bad)}`);
    }
  });
});

describe("formatNaira", () => {
  test("renders amounts the way a folio should read", () => {
    assert.equal(formatNaira(123456), "₦1,234.56");
    assert.equal(formatNaira(0), "₦0.00");
    assert.equal(formatNaira(5), "₦0.05");
    assert.equal(formatNaira(100000000), "₦1,000,000.00");
    assert.equal(formatNaira(-4550), "-₦45.50");
    assert.equal(formatNaira(123456, { symbol: false }), "1,234.56");
    assert.equal(formatNaira(123456, { decimals: false }), "₦1,234");
  });
});

describe("basis points", () => {
  test("converts percentages without float drift", () => {
    assert.equal(percentToBasisPoints(7.5), 750);
    assert.equal(percentToBasisPoints(10), 1000);
    assert.equal(percentToBasisPoints(0), 0);
    assert.equal(percentToBasisPoints(0.01), 1);
    assert.equal(percentToBasisPoints(12.34), 1234);
    assert.equal(basisPointsToPercent(750), 7.5);
    assert.equal(basisPointsToPercent(1234), 12.34);
  });
});

describe("property test: 10,000 charge/payment sequences reconcile exactly", () => {
  test("balance always equals sum(charges) - sum(payments) with zero drift", () => {
    let checked = 0;
    for (let seq = 0; seq < 10_000; seq++) {
      const chargeCount = 1 + Math.floor(Math.random() * 12);
      const paymentCount = Math.floor(Math.random() * 6);

      const charges: number[] = [];
      for (let i = 0; i < chargeCount; i++) {
        // Realistic hotel amounts, in kobo, including awkward ones.
        charges.push(Math.floor(Math.random() * 5_000_000) + 1);
      }
      const payments: number[] = [];
      for (let i = 0; i < paymentCount; i++) {
        payments.push(Math.floor(Math.random() * 5_000_000) + 1);
      }

      const totalCharges = addKobo(...charges);
      const totalPaid = addKobo(...payments);
      const balance = subKobo(totalCharges, totalPaid);

      // Independent oracle: BigInt arithmetic cannot drift at all, so this
      // is a genuine check rather than the implementation compared to
      // itself.
      const oracleCharges = charges.reduce((a, b) => a + BigInt(b), 0n);
      const oraclePayments = payments.reduce((a, b) => a + BigInt(b), 0n);
      const oracleBalance = oracleCharges - oraclePayments;

      assert.equal(BigInt(totalCharges), oracleCharges);
      assert.equal(BigInt(totalPaid), oraclePayments);
      assert.equal(BigInt(balance), oracleBalance, `sequence ${seq} drifted`);
      assert.ok(Number.isInteger(balance));
      checked++;
    }
    assert.equal(checked, 10_000);
  });

  test("the float approach this replaces genuinely does drift on the same shape of data", () => {
    // Guards against the property test above being vacuous: if float money
    // never drifted, the batch would be pointless. Uses the exact pattern
    // the old services/folio.ts had.
    const nairaCharges = Array.from({ length: 300 }, () => 0.1);
    const floatTotal = nairaCharges.reduce((a, b) => a + b, 0);
    assert.notEqual(floatTotal, 30, "300 x 0.1 does not equal 30 in floating point");

    const koboTotal = addKobo(...nairaCharges.map(toKobo));
    assert.equal(koboTotal, 3000, "the same sum in kobo is exact");
    assert.equal(fromKobo(koboTotal), 30);
  });
});
