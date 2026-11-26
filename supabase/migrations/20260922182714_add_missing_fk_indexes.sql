
create index if not exists alert_recipients_outlet_org_idx on public.alert_recipients (outlet_id, organization_id);
create index if not exists inventory_items_vendor_org_idx on public.inventory_items (vendor_id, organization_id);
create index if not exists pos_items_recipe_org_idx on public.pos_items (recipe_id, organization_id);
create index if not exists recipe_lines_recipe_org_idx on public.recipe_lines (recipe_id, organization_id);
