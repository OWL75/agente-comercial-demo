import "server-only";
import postgres from "postgres";

declare global {
  var __pgSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada. Revisa .env.local.");
  }
  return postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Lazy: the client must not connect (or throw on a missing DATABASE_URL) at
// module-evaluation time, because Next.js imports every route module during
// `next build`'s page-data collection even for fully dynamic routes.
function getClient(): ReturnType<typeof postgres> {
  if (!globalThis.__pgSql) globalThis.__pgSql = createClient();
  return globalThis.__pgSql;
}

type Sql = ReturnType<typeof postgres>;

// A Proxy, not a plain wrapper function: a plain `(...args) => getClient()(...args)`
// only forwards the tagged-template call itself and silently drops every
// property attached to the real client (`.json`, `.begin`, `.end`, ...) —
// which is exactly how a jsonb double-encoding bug slipped in here once
// (code fell back to manual `JSON.stringify(x)::jsonb`, and Postgres's own
// jsonb serializer then stringified that string again). The Proxy keeps the
// client itself lazy while making every real method reach it transparently.
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args) {
    const client = getClient() as unknown as (...a: unknown[]) => unknown;
    return client(...args);
  },
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export async function endSql(): Promise<void> {
  if (globalThis.__pgSql) await globalThis.__pgSql.end();
}

// `sql.json()`'s TS signature expects its recursive `JSONValue` type, which
// plain `Record<string, unknown>` objects (unavoidable for a jsonb column
// whose shape varies) don't structurally satisfy. This centralizes the one
// `any` needed to bridge that in a single, clearly-labeled spot rather than
// scattering casts at every call site.
export function toJsonb(value: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sql.json(value as any);
}
