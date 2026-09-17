import postgres from "postgres";

export function connectDatabase() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is not configured.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
  return postgres(value, { ssl: local ? false : "require", prepare: false, max: 1, connect_timeout: 15, onnotice: () => {} });
}

// Never print PostgreSQL error objects: they can contain query parameters or credentials.
export function safeDatabaseError(error) {
  const known = { "42P01": "Schema missing: run pnpm db:migrate.", "28P01": "Database authentication failed.", "ECONNREFUSED": "Database connection refused.", "ENOTFOUND": "Database host could not be resolved." };
  return known[error?.code] || "Database operation failed. Check DATABASE_URL, TLS and database availability.";
}
