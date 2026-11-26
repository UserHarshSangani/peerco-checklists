
alter table public.booking_snapshots alter column checked_at set default clock_timestamp();
