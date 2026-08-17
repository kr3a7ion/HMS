// Backend Blueprint B0.7 — see local-server/vitest.config.ts for the
// reasoning behind the fork isolation settings; the same constraints apply
// here (each test file owns a temp SQLite DB via NEXURA_CENTRAL_DB_PATH and
// binds its own HTTP server).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    env: { NEXURA_LOG_LEVEL: "silent" },
    pool: "forks",
    singleFork: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/test/**", "src/db/schema.ts", "src/seed.ts", "src/imports/**"],
      thresholds: undefined,
    },
  },
});
