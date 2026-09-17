import fs from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
const migration = await fs.readFile(new URL("../sql/001_initial.sql", import.meta.url), "utf8");
await sql.unsafe(migration);
await sql.end();
console.log("Database migration complete.");
