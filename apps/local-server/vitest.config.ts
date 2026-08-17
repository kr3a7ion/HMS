// Backend Blueprint B0.7. Replaces the hand-rolled `tsx --test` runner
// (scripts/run-tests.mjs) that this project needed because `tsx --test`
// with a multi-file glob reliably hung after the first file completed on
// Windows. Vitest runs each test file in its own worker, which is both the
// blueprint's stated convention and a genuine fix for that hang.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // The app logs every request as structured JSON (B0.5); at default level
    // that buries the actual test results. Failures still surface through
    // vitest's own reporter, and a specific test can re-enable logging by
    // setting the level itself.
    env: { NEXURA_LOG_LEVEL: "silent" },
    // Every test file sets NEXURA_DB_PATH to its own temp SQLite file at
    // module scope and boots a real HTTP server, so files must not share a
    // process -- forks with a single fork at a time keeps each file's DB and
    // its `process.env` mutation isolated, which is what the existing tests
    // already assume.
    pool: "forks",
    singleFork: true,
    fileParallelism: false,
    // Booting the Express app imports all 22 route files; the first test in
    // a file routinely takes several seconds on a cold start.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/test/**", "src/db/schema.ts", "src/seed.ts", "src/imports/**"],
      // B0.7 explicitly establishes a baseline without gating. Thresholds
      // arrive once the number stops moving with every batch.
      thresholds: undefined,
    },
  },
});
