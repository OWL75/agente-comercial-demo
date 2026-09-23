import { PGlite, type Transaction } from "@electric-sql/pglite";

// Test-only bridge for the small postgres.js tagged-template surface used by
// these tools. SQL itself executes in PostgreSQL/WASM, not a canned query mock.
// This does NOT emulate network concurrency or prove the production schema.
type Builder = { kind: "builder"; value: unknown[] | Record<string, unknown> };
type Json = { kind: "json"; value: unknown };
type Client = PGlite | Transaction;
export const database = new PGlite();

export function sqlFor(client: Client) {
  function sql(first: TemplateStringsArray | unknown[] | Record<string, unknown>, ...values: unknown[]): unknown {
    if (!Array.isArray(first) || !("raw" in first)) return { kind: "builder", value: first } as Builder;
    const params: unknown[] = [];
    const param = (value: unknown) => { params.push(value); return "$" + params.length; };
    const strings = first as TemplateStringsArray;
    let query = strings[0];
    values.forEach((value, index) => {
      const special = value as Builder | Json | null;
      if (special && typeof special === "object" && special.kind === "json") {
        query += param(JSON.stringify(special.value));
      } else if (special && typeof special === "object" && special.kind === "builder") {
        if (Array.isArray(special.value)) {
          query += "(" + special.value.map(param).join(",") + ")";
        } else {
          const entries = Object.entries(special.value);
          const ident = (key: string) => '"' + key.replaceAll('"', '""') + '"';
          if (/\bset\s*$/i.test(query)) query += entries.map(([key, val]) => ident(key) + "=" + param(val)).join(",");
          else query += "(" + entries.map(([key]) => ident(key)).join(",") + ") values (" + entries.map(([, val]) => param(val)).join(",") + ")";
        }
      } else query += param(value);
      query += strings[index + 1];
    });
    return client.query(query, params).then((result) => result.rows);
  }
  sql.json = (value: unknown): Json => ({ kind: "json", value });
  sql.begin = <T>(fn: (tx: ReturnType<typeof sqlFor>) => Promise<T>): Promise<T> =>
    database.transaction((tx) => fn(sqlFor(tx)));
  return sql;
}

export const sql = sqlFor(database);
