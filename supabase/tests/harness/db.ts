import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "migrations");

export type Db = PGlite;

// Boots a fresh in-process Postgres, installs the Supabase stand-in, then
// applies every migration in supabase/migrations in filename order — the
// same order Supabase applies them in.
export async function createTestDb(): Promise<Db> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

// Runs `fn` as a signed-in user (role `authenticated`, auth.uid() = userId),
// exactly as PostgREST would, inside a transaction that is always rolled
// back so tests never leak state into each other.
export async function asUser<T>(
  db: Db,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
      await tx.exec(userId ? "set local role authenticated" : "set local role anon");
      try {
        result = await fn(tx);
      } catch (error) {
        failure = error;
      }
      await tx.rollback();
    })
    .catch(() => {});
  if (failure) throw failure;
  return result as T;
}
