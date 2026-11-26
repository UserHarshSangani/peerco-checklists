
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index on public.checklist_submissions (submitted_by);
create index on public.tasks (created_by);
