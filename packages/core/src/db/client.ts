import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { env } from "../env.js";

export type DB = ReturnType<typeof createDb>;

function createDb() {
  return drizzle(postgres(env.databaseUrl(), { max: 10, prepare: false }), { schema });
}

declare global {
  // eslint-disable-next-line no-var
  var __rendervidDb: DB | undefined;
}

export function getDb(): DB {
  if (!globalThis.__rendervidDb) globalThis.__rendervidDb = createDb();
  return globalThis.__rendervidDb;
}
