// Backend Blueprint B0.8 — guards invariant 3 ("any handler performing more
// than one write wraps them in db.transaction()").
//
// HOW IT WORKS. For each route file, find every `router.<method>(...)`
// registration, extract its full body by brace matching, strip out any
// `db.transaction(...)` / `immediateTransaction(...)` blocks (also brace
// matched), then count the `.run(` calls left over. Two or more surviving
// calls means a handler does multiple un-atomic writes.
//
// This is more precise than the blueprint's suggested per-file `.run(`
// count, which would flag a file with ten single-write handlers. The cost
// is that it is a regex + brace matcher rather than a real parser: it can
// be fooled by `.run(` inside a string literal or a comment. That is an
// acceptable trade for a guard rail, and a false positive is visible and
// cheap to fix.
//
// RATCHET, NOT GATE. The codebase currently has zero db.transaction() calls
// -- that is the whole reason B3 exists. Failing on every pre-existing
// violation would just mean a permanently red CI that everyone learns to
// ignore. Instead the known violations are recorded in
// lint-invariants-baseline.json and only *new* or *worsened* ones fail.
// B3 drives the baseline to empty; after that, `--strict` can be turned on
// permanently to forbid re-adding any.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.resolve(here, "..", "src", "routes");
const baselinePath = path.resolve(here, "lint-invariants-baseline.json");

const WRITE_CALL = /\.run\s*\(/g;
const ROUTE_REGISTRATION = /router\.(get|post|patch|put|delete)\s*\(/g;
// Recognises all three forms: drizzle's `db.transaction(...)` and the two
// helpers in src/db/tx.ts. The bare `transaction(` alternative must be last
// so `db.transaction(` matches as a whole at the same position.
const TRANSACTION_OPEN = /\b(?:db\.transaction|immediateTransaction|transaction)\s*\(/g;

/**
 * Given source text and the index of an opening delimiter's `(`, return the
 * index just past its matching `)`. Skips over string literals, template
 * literals, and comments so a brace inside one doesn't throw off the count.
 */
function matchDelimiter(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === "/" && next === "/") { i = src.indexOf("\n", i); if (i === -1) return src.length; continue; }
    if (ch === "/" && next === "*") { const end = src.indexOf("*/", i + 2); i = end === -1 ? src.length : end + 2; continue; }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return src.length;
}

/** Removes every db.transaction(...) / immediateTransaction(...) block. */
function stripTransactionBlocks(body) {
  let out = body;
  for (;;) {
    TRANSACTION_OPEN.lastIndex = 0;
    const m = TRANSACTION_OPEN.exec(out);
    if (!m) return out;
    const openParen = out.indexOf("(", m.index + m[0].length - 1);
    const end = matchDelimiter(out, openParen);
    out = out.slice(0, m.index) + out.slice(end);
  }
}

function lineOf(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

function analyseFile(filePath) {
  const src = readFileSync(filePath, "utf8");
  const fileName = path.basename(filePath);
  const violations = [];

  ROUTE_REGISTRATION.lastIndex = 0;
  let match;
  while ((match = ROUTE_REGISTRATION.exec(src)) !== null) {
    const openParen = src.indexOf("(", match.index + match[0].length - 1);
    const end = matchDelimiter(src, openParen);
    const body = src.slice(openParen, end);

    const outsideTx = stripTransactionBlocks(body);
    WRITE_CALL.lastIndex = 0;
    const writeCount = (outsideTx.match(WRITE_CALL) ?? []).length;

    if (writeCount >= 2) {
      const routePath = /router\.\w+\(\s*["'`]([^"'`]*)/.exec(src.slice(match.index))?.[1] ?? "?";
      violations.push({
        file: fileName,
        line: lineOf(src, match.index),
        method: match[1].toUpperCase(),
        path: routePath,
        writes: writeCount,
      });
    }
    ROUTE_REGISTRATION.lastIndex = end;
  }
  return violations;
}

// ─── Invariant 2: money is integer kobo (Backend Blueprint B2) ───────────
//
// Bans the float-money idioms outside lib/money.ts: `* 100`, `/ 100`, and
// `.toFixed(2)`. Those three are how naira<->kobo conversion and 2dp money
// rounding get open-coded, and every one of them outside money.ts is either
// a bug or a conversion that should be going through toKobo/fromKobo.
//
// NARROWED BY A REAL FALSE-POSITIVE RATE. The first version flagged any
// `* 100` / `/ 100` and immediately hit six legitimate sites -- CPU load,
// free-memory percentage, occupancy rate, and two guest-mix ratios. All are
// percentage maths, none are money. A linter that cries wolf on correct code
// is one that gets switched off, so the patterns now only fire when the same
// line also mentions something money-shaped.
//
// `rate` and `total` are deliberately NOT money markers: "Occupancy Rate"
// and `total > 0 ? ... : 0` are exactly the lines that produced the false
// positives.
const MONEY_CONTEXT = /kobo|amount|price|cost|balance|revenue|payment|charge|naira|salary|payrate|₦/i;
const MONEY_BAN_PATTERNS = [
  { re: /\*\s*100\b(?!\s*\/)/g, what: "* 100 (naira -> kobo conversion belongs in money.ts)", needsContext: true },
  { re: /\/\s*100\b/g, what: "/ 100 (kobo -> naira conversion belongs in money.ts)", needsContext: true },
  // toFixed(2) needs no context test: 2dp formatting is money formatting
  // essentially always, and the few non-money uses read fine as a nudge.
  { re: /\.toFixed\(2\)/g, what: ".toFixed(2) (2dp money formatting belongs in money.ts)", needsContext: false },
];

// Files allowed to contain them, because they ARE the boundary.
const MONEY_EXEMPT = [
  path.join("src", "lib", "money.ts"),
  path.join("src", "db", "migrate.ts"),   // legacy backfill SQL strings
  path.join("src", "test"),               // tests assert on the conversions
];

function stripCommentsAndStrings(src) {
  // Crude but adequate: blanks out comments and string/template bodies so a
  // "/ 100" inside a comment or an SQL string isn't reported.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => " ".repeat(m.length))
    .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length))
    .replace(/`(?:\\.|[^`\\])*`/g, m => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\])*"/g, m => " ".repeat(m.length))
    .replace(/'(?:\\.|[^'\\])*'/g, m => " ".repeat(m.length));
}

function scanMoneyViolations(srcRoot) {
  const violations = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts")) continue;
      const rel = path.relative(path.resolve(srcRoot, ".."), full);
      if (MONEY_EXEMPT.some(ex => rel.startsWith(ex))) continue;

      const cleaned = stripCommentsAndStrings(readFileSync(full, "utf8"));
      const lines = cleaned.split("\n");
      for (const { re, what, needsContext } of MONEY_BAN_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(cleaned)) !== null) {
          const lineNo = cleaned.slice(0, m.index).split("\n").length;
          // Percentage maths uses the same operators; only report when the
          // line is actually about money. See MONEY_CONTEXT above.
          if (needsContext && !MONEY_CONTEXT.test(lines[lineNo - 1] ?? "")) continue;
          violations.push({ file: rel.replace(/\\/g, "/"), line: lineNo, what });
        }
      }
    }
  };
  walk(srcRoot);
  return violations;
}

// ─── B6 DoD: no posting path bypasses the tax engine ────────────────────
//
// The batch's definition of done is "every posting path calls computeTax --
// folio charges, night audit room charges, POS orders, room service, fleet
// trips. No exceptions." That is a claim about code that does not exist yet
// as much as code that does, so it cannot be verified by a test; a new
// module added next month is exactly where a bypass appears.
//
// So it is enforced structurally instead: there is one function that writes
// a folio charge, and any other db.insert(folioCharges) fails the build. The
// failure message says which function to call, because the person who trips
// this is usually adding a legitimate new posting path.
const CHARGE_INSERT = /db\.insert\(\s*folioCharges\s*\)/g;

// The three files allowed to write the table directly, and why:
const TAX_ENGINE_EXEMPT = new Map([
  [path.join("src", "services", "tax", "posting.ts"), "the posting helper itself"],
  // A reversal is not a new taxable event -- it mirrors rows the engine
  // already taxed, and re-taxing it would double-count.
  [path.join("src", "services", "ledger.ts"), "voids/reversals mirror already-taxed rows"],
  // Demo fixtures, not a posting path: it builds a database from nothing,
  // before any tax code exists to compute from.
  [path.join("src", "seed.ts"), "dev seed fixtures"],
]);

function scanTaxBypasses(srcRoot) {
  const violations = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts")) continue;
      const rel = path.relative(path.resolve(srcRoot, ".."), full);
      // Tests build ledger rows directly to set up scenarios; that is
      // fixture construction, not a posting path.
      if (rel.startsWith(path.join("src", "test"))) continue;
      if (TAX_ENGINE_EXEMPT.has(rel)) continue;

      const src = stripCommentsAndStrings(readFileSync(full, "utf8"));
      CHARGE_INSERT.lastIndex = 0;
      let m;
      while ((m = CHARGE_INSERT.exec(src)) !== null) {
        violations.push({ file: rel.replace(/\\/g, "/"), line: src.slice(0, m.index).split("\n").length });
      }
    }
  };
  walk(srcRoot);
  return violations;
}

// `--list` prints every current violation with its location, for working
// through them; the pass/fail logic below is unaffected.
if (process.argv.includes("--list")) {
  const all = readdirSync(routesDir).filter(f => f.endsWith(".ts")).sort()
    .flatMap(f => analyseFile(path.join(routesDir, f)));
  for (const v of all) {
    console.log(`${v.file.padEnd(20)} ${String(v.line).padStart(4)}  ${v.method.padEnd(6)} ${String(v.path).padEnd(26)} writes=${v.writes}`);
  }
  console.log(`
${all.length} handler(s) with 2+ writes outside a transaction`);
  process.exit(0);
}

// ─── Invariant 9: financial rows carry a business date (B5) ─────────────
//
// Every insert into folio_charges or payments must set businessDate. A row
// without one cannot be attributed to a trading day, so it silently drops
// out of daily_revenue and the day stops reconciling -- the exact failure
// the 30-day test exists to catch, but caught at edit time instead.
const FINANCIAL_INSERT = /db\.insert\(\s*(folioCharges|payments)\s*\)\s*\.values\s*\(/g;

function scanBusinessDateViolations(srcRoot) {
  const violations = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts")) continue;
      const rel = path.relative(path.resolve(srcRoot, ".."), full);
      // Tests construct rows directly and are allowed to be explicit.
      if (rel.startsWith(path.join("src", "test"))) continue;

      const src = readFileSync(full, "utf8");
      FINANCIAL_INSERT.lastIndex = 0;
      let m;
      while ((m = FINANCIAL_INSERT.exec(src)) !== null) {
        const openParen = src.indexOf("(", m.index + m[0].length - 1);
        const end = matchDelimiter(src, openParen);
        const values = src.slice(openParen, end);
        // `businessDate:` OR the shorthand `businessDate,` / `businessDate }`.
        // Matching only the colon form produced a false positive on
        // roomCharges.ts, which passes it through as a shorthand property.
        if (!/\bbusinessDate\s*[,:}]/.test(values)) {
          violations.push({
            file: rel.replace(/\\/g, "/"),
            line: src.slice(0, m.index).split("\n").length,
            table: m[1],
          });
        }
      }
    }
  };
  walk(srcRoot);
  return violations;
}

const strict = process.argv.includes("--strict");
const updateBaseline = process.argv.includes("--update-baseline");

const files = readdirSync(routesDir).filter(f => f.endsWith(".ts")).sort();
const found = files.flatMap(f => analyseFile(path.join(routesDir, f)));
const moneyViolations = scanMoneyViolations(path.resolve(here, "..", "src"));
const businessDateViolations = scanBusinessDateViolations(path.resolve(here, "..", "src"));
const taxBypasses = scanTaxBypasses(path.resolve(here, "..", "src"));

// The baseline is keyed by FILE and holds a multiset of write-counts, not
// line numbers. Line-based keys looked precise but were useless in practice:
// adding a single import at the top of a file shifted every handler and made
// all 20 known violations read as new. A multiset is immune to line shifts
// and to reordering, while still catching what matters -- an extra violating
// handler, or an existing one that grew more un-atomic writes.
function multisetByFile(violations) {
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v.writes);
  }
  for (const counts of byFile.values()) counts.sort((a, b) => a - b);
  return byFile;
}

if (updateBaseline) {
  const byFile = Object.fromEntries(multisetByFile(found));
  writeFileSync(baselinePath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    note: "Per-file multiset of write-counts for handlers that skip db.transaction(). Cleared by Batch B3.",
    writeCountsByFile: byFile,
  }, null, 2) + "\n");
  console.log(`Baseline written: ${found.length} known violation(s) across ${Object.keys(byFile).length} file(s).`);
  process.exit(0);
}

const baselineByFile = existsSync(baselinePath) && !strict
  ? new Map(Object.entries(JSON.parse(readFileSync(baselinePath, "utf8")).writeCountsByFile ?? {}))
  : new Map();
const baselineCount = [...baselineByFile.values()].reduce((n, c) => n + c.length, 0);

// A violation is "new or worse" if the file's current multiset contains an
// entry the baseline's does not cover. Consume matches greedily from the
// sorted baseline so two handlers at 2 writes need two baselined 2s.
const newOrWorse = [];
for (const [file, counts] of multisetByFile(found)) {
  const remaining = [...(baselineByFile.get(file) ?? [])];
  for (const writes of counts) {
    const idx = remaining.indexOf(writes);
    if (idx === -1) newOrWorse.push({ file, writes });
    else remaining.splice(idx, 1);
  }
}

console.log(`lint:invariants — scanned ${files.length} route file(s) in src/routes`);
console.log(`  ${found.length} handler(s) perform 2+ writes outside a transaction`);
if (!strict) console.log(`  ${baselineCount} known (baselined, to be cleared by Batch B3)`);

if (newOrWorse.length > 0) {
  console.error(`\n✗ ${newOrWorse.length} NEW violation(s) of invariant 3 (multi-write handler not wrapped in db.transaction):\n`);
  for (const v of newOrWorse) console.error(`    ${v.file}  — a handler with ${v.writes} writes not covered by the baseline`);
  console.error(`\n  Wrap the writes in db.transaction(() => { ... })(), or`);
  console.error(`  immediateTransaction(...) if it is a check-then-write pair.`);
  process.exit(1);
}

if (moneyViolations.length > 0) {
  console.error(`\n✗ ${moneyViolations.length} violation(s) of invariant 2 (float-money arithmetic outside lib/money.ts):\n`);
  for (const v of moneyViolations) console.error(`    ${v.file}:${v.line}  — ${v.what}`);
  console.error(`\n  Route the conversion through src/lib/money.ts (toKobo / fromKobo /`);
  console.error(`  mulRate / valueKobo). Money is integer kobo everywhere else.`);
  process.exit(1);
}
console.log(`  0 float-money violations (invariant 2)`);

if (businessDateViolations.length > 0) {
  console.error(`
✗ ${businessDateViolations.length} financial insert(s) missing businessDate (invariant 9):
`);
  for (const v of businessDateViolations) console.error(`    ${v.file}:${v.line}  — db.insert(${v.table}) without businessDate`);
  console.error(`
  Stamp it with currentBusinessDate(branchId) from src/lib/businessDate.ts.`);
  console.error(`  A row with no business date drops out of daily_revenue and the day stops reconciling.`);
  process.exit(1);
}
console.log(`  0 financial inserts missing businessDate (invariant 9)`);

if (taxBypasses.length > 0) {
  console.error(`
✗ ${taxBypasses.length} folio charge insert(s) bypassing the tax engine (B6 DoD):
`);
  for (const v of taxBypasses) console.error(`    ${v.file}:${v.line}  — db.insert(folioCharges) outside services/tax/posting.ts`);
  console.error(`
  Call postChargeWithTax() from src/services/tax/posting.ts instead.`);
  console.error(`  A charge posted around the engine is a charge with no tax on it, and`);
  console.error(`  nobody notices until an FIRS audit. Allowed exceptions:`);
  for (const [file, why] of TAX_ENGINE_EXEMPT) console.error(`    ${file.replace(/\\/g, "/")} — ${why}`);
  process.exit(1);
}
console.log(`  0 posting paths bypassing the tax engine (B6)`);

console.log(strict ? "\n✓ No violations." : "\n✓ No new violations.");
