
-- The trigger always sets a correct value before the NOT NULL check runs, for every case
-- (recipe_unit null -> 1, standard pair -> derived, custom pcs pack -> must be supplied).
-- The old "default 1" let an omitted value on a custom pack item slip through looking deliberate;
-- dropping it makes an omitted value arrive as NULL, which the trigger correctly rejects.
alter table public.inventory_items alter column recipe_factor drop default;
