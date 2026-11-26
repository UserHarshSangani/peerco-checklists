import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure logic only (engines, helpers) — no browser, no
// Supabase. RLS/SQL tests live separately under supabase/tests/.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
