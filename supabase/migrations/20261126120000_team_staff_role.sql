-- Daybook Team: new login role for staff using their own phone.
-- Kept in its own migration: Postgres won't let a new enum value be used
-- in the same transaction that adds it.
alter type public.user_role add value if not exists 'staff';
