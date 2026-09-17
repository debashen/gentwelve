import fs from "node:fs/promises";
import { connectDatabase, safeDatabaseError } from "./database.mjs";

let sql;
try {
  sql = connectDatabase();
  const directory = new URL("../sql/", import.meta.url);
  const files = (await fs.readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(1274137)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    for (const name of files) {
      if ((await tx`SELECT name FROM schema_migrations WHERE name=${name}`).length) continue;
      await tx.unsafe(await fs.readFile(new URL(name, directory), "utf8"));
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
      console.log(`Applied ${name}`);
    }
  });
  console.log("Database migration complete.");
} catch (error) {
  console.error(process.env.DATABASE_URL ? safeDatabaseError(error) : "DATABASE_URL is not configured.");
  process.exitCode = 1;
} finally { await sql?.end(); }
