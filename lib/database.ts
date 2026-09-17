import { AsyncLocalStorage } from "node:async_hooks";
import postgres, { type Sql, type TransactionSql } from "postgres";

const transactions = new AsyncLocalStorage<TransactionSql>();

let client: Sql | undefined;

function getClient() {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  client = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: ["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname) ? false : "require",
    prepare: false,
    transform: { value: { from(value, column) {
      if (column.type !== 20) return value;
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds the safe JavaScript range.");
      return number;
    } } },
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

  async execute<T extends Record<string, unknown>>(sql: Sql | TransactionSql = transactions.getStore() ?? getClient()) {
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
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    return getClient().begin(transaction => transactions.run(transaction, work)) as Promise<T>;
  },
  async batch(statements: PreparedStatement[]) {
    const execute = async (transaction: TransactionSql) => {
      const results = [];
      for (const statement of statements) results.push(await statement.execute(transaction));
      return results;
    };
    const transaction = transactions.getStore();
    return transaction ? execute(transaction) : getClient().begin(execute);
  },
};
