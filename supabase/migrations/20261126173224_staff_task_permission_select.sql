-- The Staff screen reads the four task switches, but only UPDATE was ever
-- granted on them, so the whole query failed with "permission denied for
-- table staff". Allow reading them; row-level security still limits rows
-- to outlets the person can see. pin_hash stays unreadable.
grant select (can_checklists, can_stock_counts, can_goods_received, can_wastage) on public.staff to authenticated;
