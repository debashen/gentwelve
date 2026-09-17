import postgres, { type Sql } from "postgres";

let client: Sql | undefined;

function getClient() {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  client = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: "require",
  });
  return client;
}

function postgresQuery(query: string) {
  let index = 0;
  return query
    .replace(/\?/g, () => `$${++index}`)
    .replace(/\bAS\s+([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g, 'AS "$1"');
}

export class PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly query: string) {}

  bind(...values: unknown[]) {
    const statement = new PreparedStatement(this.query);
    statement.values = values;
    return statement;
  }

  async execute<T extends Record<string, unknown>>(sql: any = getClient()) {
    return sql.unsafe(postgresQuery(this.query), this.values as never[]) as Promise<T[] & { count: number }>;
  }

  async all<T extends Record<string, unknown>>() {
    const rows = await this.execute<T>();
    return { results: [...rows] };
  }

  async first<T extends Record<string, unknown>>() {
    const rows = await this.execute<T>();
    return rows[0] ?? null;
  }

  async run() {
    const rows = await this.execute<Record<string, unknown>>();
    const changes = rows.count ?? 0;
    return { success: true, changes, meta: { changes }, results: [...rows] };
  }
}

export const DB = {
  prepare(query: string) {
    return new PreparedStatement(query);
  },
  async batch(statements: PreparedStatement[]) {
    return getClient().begin(async (transaction) => {
      const results = [];
      for (const statement of statements) results.push(await statement.execute(transaction));
      return results;
    });
  },
};
