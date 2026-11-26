# Supabase

`migrations/` holds every schema change, in order. The first 24 files
(20260920114804 … 20260923040751) were recovered verbatim from the live
project's migration history (`supabase_migrations.schema_migrations`) on
2026-11-26 and checksum-verified against it; the live schema had no objects
outside that history.

Rules:
- Never change the production database by hand (SQL editor). Every change is
  a new migration file here, reviewed in a PR, then applied.
- Never edit an applied migration; add a new one.
