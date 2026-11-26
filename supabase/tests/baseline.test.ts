import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./harness/db";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

describe("baseline migrations", () => {
  it("apply cleanly and create the core tables", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'public'`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(32);
  });
});
