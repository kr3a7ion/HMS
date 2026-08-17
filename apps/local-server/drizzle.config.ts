// Backend Blueprint B1. This exists so `npm run db:generate` can *author*
// new migrations by diffing schema.ts against the current database. It is
// deliberately NOT what applies them at runtime -- src/db/migrate.ts is,
// because the runtime path needs a future-schema guard, pre-migration
// snapshots, and baselining, none of which drizzle-kit's migrator does.
//
// Workflow for a schema change:
//   1. edit src/db/schema.ts
//   2. npm run db:generate      -> writes SQL into src/db/migrations/
//   3. review the generated SQL, rename it to NNNN_short_name.sql if needed
//      (the runner requires that form and applies files in numeric order)
//   4. boot the server; migrate.ts applies it inside a transaction
//
// Step 3 is not ceremony: generated migrations are a starting point, and
// anything touching existing rows (backfills, NOT NULL adds, column drops)
// needs a human to decide the data-migration half.
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.NEXURA_DB_PATH ?? "./data/nexura.db",
  },
} satisfies Config;
