-- =========================================================
-- Daybook Team — Milestone 1 schema
-- Staff profiles, salary, roster, attendance, leave, cover/overtime,
-- Gullak, advances, payroll, exits, settings, notifications, audit log.
--
-- Conventions
--   * money: bigint paise, column names end in _paise. Never floats.
--   * rates: integer basis points (1200 = 12.00%) inside jsonb values.
--   * timestamps: timestamptz (UTC). business_date: IST calendar date.
--     Shift times: time-of-day, IST wall clock.
--   * every row carries outlet_id so RLS can scope it.
--   * ledgers (leave, Gullak, advances) are append-only; balances are sums.
--
-- Access (RLS)
--   * peerco_admin: everything.
--   * owner: outlets in their organization. manager: outlets in outlet_users.
--     (both via the existing private.can_manage_outlet)
--   * staff (own-phone login): only their own rows (private.my_staff_id()).
--   * device (tablet): NOTHING here directly. It only gets security-definer
--     RPCs (check-in/out, today's roster) added in later milestones.
--   * pay data (salary, payslip lines, bank): admin + owner, and managers
--     only if the outlet setting team.managers_see_pay is on.
--   * ledgers, payroll lines, attendance and audit rows are never written
--     directly by browser roles; security-definer RPCs / the server do it.
-- =========================================================

-- ---------- Settings ----------
-- Defaults live in code (lib/team/settings/registry.ts); a row here only
-- exists when an outlet overrides a default.
create table public.outlet_settings (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (outlet_id, key)
);

-- Statutory rates and ceilings, dated so a rate change never rewrites history.
-- key examples: pf.employee_rate, pf.wage_ceiling, esic.gross_ceiling.
create table public.statutory_rates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  state text,                     -- null = all-India
  effective_from date not null,
  value jsonb not null,           -- {"bps": 1200} or {"paise": 1500000}
  verify boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (key, state, effective_from)
);

-- Professional tax slabs per state. month = null applies to every month;
-- a row with month set overrides it for that month (e.g. Maharashtra Feb).
create table public.state_pt_slabs (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  effective_from date not null,
  gender text check (gender in ('male', 'female', 'other')),   -- null = any
  month int check (month between 1 and 12),
  min_gross_paise bigint not null,
  max_gross_paise bigint,          -- null = no upper bound
  pt_paise bigint not null check (pt_paise >= 0),
  verify boolean not null default true,
  created_at timestamptz not null default now(),
  check (max_gross_paise is null or max_gross_paise >= min_gross_paise)
);
create index on public.state_pt_slabs (state, effective_from);

-- ---------- Staff profiles ----------
-- Personal and employment details, 1:1 with staff. Separate from staff on
-- purpose: the tablet login can read staff (for the name picker) and must
-- never see mobile numbers, birthdays or statutory IDs.
create table public.staff_profiles (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  mobile text check (mobile ~ '^[6-9][0-9]{9}$'),
  gender text check (gender in ('male', 'female', 'other')),
  date_of_birth date,
  joining_date date,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_notice', 'exited', 'absconded')),
  wage_type text not null default 'monthly' check (wage_type in ('monthly', 'daily')),
  is_part_timer_on_call boolean not null default false,
  uan text check (uan ~ '^[0-9]{12}$'),
  esic_ip_number text check (esic_ip_number ~ '^[0-9]{10}$'),
  pf_on_actual_wages boolean not null default false,
  emergency_contact_name text,
  emergency_contact_phone text,
  late_shift_consent boolean not null default false,
  late_shift_consent_at timestamptz,
  transport_note text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  login_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A mobile number logs into exactly one staff record.
create unique index staff_profiles_login_mobile_key on public.staff_profiles (mobile)
  where login_enabled;
create index on public.staff_profiles (outlet_id);

-- Bank details for the owner's transfer sheet. account_number_enc is
-- AES-256-GCM ciphertext made by the server (key in TEAM_ENCRYPTION_KEY);
-- no browser role can read it at all — only the masked last4.
create table public.staff_bank_accounts (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  account_holder_name text not null,
  account_number_enc text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  ifsc text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  updated_at timestamptz not null default now()
);

create table public.staff_skills (
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  skill text not null check (skill ~ '^[a-z][a-z0-9_]*$'),
  primary key (staff_id, skill)
);
create index on public.staff_skills (outlet_id, skill);

-- Versioned: a pay change is a new row with a later effective_from, never an edit.
create table public.salary_structures (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  effective_from date not null,
  wage_type text not null check (wage_type in ('monthly', 'daily')),
  basic_paise bigint not null default 0 check (basic_paise >= 0),
  da_paise bigint not null default 0 check (da_paise >= 0),
  hra_paise bigint not null default 0 check (hra_paise >= 0),
  -- [{"code","label","paise","excluded_from_wages":bool}]
  other_allowances jsonb not null default '[]'::jsonb check (jsonb_typeof(other_allowances) = 'array'),
  fixed_incentives jsonb not null default '[]'::jsonb check (jsonb_typeof(fixed_incentives) = 'array'),
  daily_rate_paise bigint check (daily_rate_paise >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (staff_id, effective_from),
  check (wage_type = 'monthly' or daily_rate_paise is not null)
);

create table public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  kind text not null check (kind in ('appointment_letter_signed', 'id_proof', 'address_proof',
                                     'bank_proof', 'photo', 'leave_proof', 'other')),
  storage_path text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.staff_documents (staff_id);

create table public.joining_checklists (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  -- {"documents_collected":bool, "bank_details":bool, "esic_registered":bool,
  --  "pf_registered":bool, "appointment_letter_signed":bool}
  items jsonb not null default '{}'::jsonb,
  buddy_staff_id uuid references public.staff(id) on delete set null,
  day7_checkin_at timestamptz,
  day7_note text,
  day30_checkin_at timestamptz,
  day30_note text,
  updated_at timestamptz not null default now()
);

create table public.appointment_letter_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  body_markdown text not null,      -- {{placeholders}} filled at render time
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Shifts, roster, attendance ----------
create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  -- [{"start":"11:00","end":"15:00"},{"start":"18:00","end":"23:00"}]
  segments jsonb not null check (jsonb_typeof(segments) = 'array' and jsonb_array_length(segments) between 1 and 3),
  break_minutes int not null default 0 check (break_minutes >= 0),
  paid_break boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (outlet_id, name)
);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  business_date date not null,
  kind text not null default 'work' check (kind in ('work', 'weekly_off')),
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  segments jsonb not null default '[]'::jsonb check (jsonb_typeof(segments) = 'array'),
  extended_until time,              -- set when a cover request extends the shift
  role_skill text,                  -- what they're rostered as today
  source text not null default 'manual' check (source in ('manual', 'copied', 'cover', 'seed')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, business_date),
  check (kind = 'weekly_off' or jsonb_array_length(segments) >= 1)
);
create index on public.roster_entries (outlet_id, business_date);

create table public.staff_availability (
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  available boolean not null,
  note text,
  primary key (staff_id, business_date)
);

create table public.staffing_minimums (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  role_skill text not null,
  weekday int check (weekday between 0 and 6),   -- 0 = Sunday; null = every day
  slot_start time not null,
  slot_end time not null,
  min_count int not null check (min_count >= 0),
  created_at timestamptz not null default now(),
  check (slot_end > slot_start)
);
create index on public.staffing_minimums (outlet_id);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  business_date date not null,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null,
  photo_path text,
  source text not null check (source in ('device', 'phone', 'manager', 'auto')),
  recorded_by uuid references auth.users(id) on delete set null default auth.uid(),
  status text not null default 'ok' check (status in ('ok', 'needs_confirmation', 'edited', 'void')),
  note text,
  created_at timestamptz not null default now()
);
create index on public.attendance_events (outlet_id, business_date);
create index on public.attendance_events (staff_id, business_date);

-- Per-person-per-day summary, rebuilt from events + roster + leave. Payroll
-- and Gullak read this, never the raw events.
create table public.attendance_days (
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  status text not null check (status in ('present', 'half_day', 'absent_unapproved', 'leave',
                                         'weekly_off', 'not_rostered', 'needs_confirmation')),
  first_in timestamptz,
  last_out timestamptz,
  late_minutes int not null default 0,
  payable_minutes int not null default 0,
  leave_request_id uuid,
  computed_at timestamptz not null default now(),
  primary key (staff_id, business_date)
);
create index on public.attendance_days (outlet_id, business_date);

-- ---------- Leave ----------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  paid boolean not null,
  needs_proof boolean not null default false,
  counts_for_streak boolean not null default true,   -- approved leave never breaks Gullak
  -- {"per_year_days":12,"accrual":"monthly","carry_forward_max_days":0,"encashable":false}
  accrual jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unique (outlet_id, code)
);

-- Balance = sum(delta_minutes). Half a day = half of the standard shift.
create table public.leave_ledger (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  delta_minutes int not null,
  reason text not null check (reason in ('accrual', 'approval', 'comp_off', 'encashment', 'adjustment', 'opening')),
  ref_id uuid,
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.leave_ledger (staff_id, leave_type_id);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  from_date date not null,
  to_date date not null,
  leaving_at time,                  -- half-day: "leaving at 19:00"
  reason text,
  proof_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  paid_minutes int,                 -- set on approval
  unpaid_minutes int,
  impact_snapshot jsonb,            -- coverage gaps shown to the approver
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (to_date >= from_date),
  check (leaving_at is null or from_date = to_date)
);
create index on public.leave_requests (outlet_id, status);
create index on public.leave_requests (staff_id, from_date);

-- ---------- Cover requests and overtime ----------
create table public.cover_requests (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  role_skill text not null,
  slot_start time not null,
  slot_end time not null,
  mode text not null check (mode in ('first_accept', 'manager_pick')),
  status text not null default 'open' check (status in ('open', 'filled', 'escalated', 'expired', 'cancelled')),
  escalation_stage text not null default 'staff'
    check (escalation_stage in ('staff', 'manager', 'part_timers', 'other_outlets')),
  offer_expires_at timestamptz,
  filled_by_staff_id uuid references public.staff(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (slot_end > slot_start)
);
create index on public.cover_requests (outlet_id, business_date);

create table public.cover_offers (
  id uuid primary key default gen_random_uuid(),
  cover_request_id uuid not null references public.cover_requests(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,  -- the requesting outlet
  wave int not null default 1,
  offered_ot_paise bigint,
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  response text check (response in ('accepted', 'declined', 'expired')),
  chose_comp_off boolean not null default false,
  selected boolean not null default false,
  unique (cover_request_id, staff_id)
);
create index on public.cover_offers (staff_id);

create table public.overtime_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  cover_request_id uuid references public.cover_requests(id) on delete set null,
  planned_minutes int not null check (planned_minutes >= 0),
  actual_minutes int check (actual_minutes >= 0),
  hourly_rate_paise bigint,
  multiplier_bps int,               -- 20000 = 2x
  amount_paise bigint,
  comp_off boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'worked', 'cancelled')),
  payroll_run_id uuid,
  created_at timestamptz not null default now()
);
create index on public.overtime_entries (staff_id, business_date);
create index on public.overtime_entries (outlet_id, business_date);

-- ---------- Gullak ----------
create table public.gullak_ledger (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  kind text not null check (kind in ('credit_payable', 'credit_locked', 'unlock', 'payout', 'forfeit')),
  amount_paise bigint not null,     -- credits/unlock positive; payout/forfeit negative
  streak_day int,
  level int,
  milestone_months int,
  payroll_run_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index on public.gullak_ledger (staff_id, business_date);
-- One daily credit of each half per person per day.
create unique index gullak_one_credit_per_day on public.gullak_ledger (staff_id, business_date, kind)
  where kind in ('credit_payable', 'credit_locked');

-- Cache only — always rebuildable from attendance_days by the engine.
create table public.gullak_streaks (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  current_day int not null default 0,
  current_level int not null default 1,
  last_counted_date date,
  updated_at timestamptz not null default now()
);

-- ---------- Advances ----------
create table public.advances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  amount_paise bigint not null check (amount_paise > 0),
  reason text,
  cap_paise_at_request bigint,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'recovered')),
  -- [{"month":"2026-12-01","paise":150000}]
  recovery_schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(recovery_schedule) = 'array'),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.advances (staff_id, status);

create table public.advance_recoveries (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references public.advances(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  payroll_run_id uuid,
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now()
);
create index on public.advance_recoveries (advance_id);

-- ---------- Payroll ----------
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'locked')),
  totals jsonb not null default '{}'::jsonb,
  calculated_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (outlet_id, period_month)
);

-- One row per person per component (basic, ot, gullak, pf_employee, ...).
create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  component_code text not null,
  kind text not null check (kind in ('earning', 'deduction', 'employer', 'info')),
  amount_paise bigint not null,
  meta jsonb not null default '{}'::jsonb,
  position int not null default 0
);
create index on public.payroll_lines (payroll_run_id, staff_id);

-- Corrections after a run is locked land here, for the next month.
create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  target_month date not null check (extract(day from target_month) = 1),
  amount_paise bigint not null,      -- positive = pay more, negative = recover
  reason text not null,
  source_run_id uuid references public.payroll_runs(id) on delete set null,
  applied_run_id uuid references public.payroll_runs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.parallel_run_uploads (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  file_name text not null,
  parsed jsonb not null,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Exits ----------
create table public.exits (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  exit_type text not null check (exit_type in ('resignation', 'termination', 'absconded', 'other')),
  notice_given_on date,
  last_working_day date,
  reason_code text,
  note text,
  settlement jsonb,
  settled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.exits (outlet_id);

create table public.absconding_cases (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  flagged_on date not null,
  consecutive_absent_days int not null,
  -- [{"at":..., "by":..., "method":"call|whatsapp|visit|letter", "note":...}]
  contact_attempts jsonb not null default '[]'::jsonb,
  notices jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'returned', 'marked_absconded', 'closed')),
  created_at timestamptz not null default now()
);

-- ---------- Notifications, push, audit ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,   -- i18n key + vars, never pre-rendered text
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (recipient_profile_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  outlet_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log (table_name, row_id);
create index on public.audit_log (outlet_id, at desc);

-- ---------- Helpers ----------

-- The staff row linked to the signed-in phone login, if any.
create or replace function private.my_staff_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select sp.staff_id from public.staff_profiles sp
   where sp.auth_user_id = (select auth.uid()) and sp.login_enabled
$$;

create or replace function private.staff_outlet(p_staff uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select s.outlet_id from public.staff s where s.id = p_staff $$;

create or replace function private.outlet_setting(p_outlet uuid, p_key text)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select os.value from public.outlet_settings os where os.outlet_id = p_outlet and os.key = p_key $$;

-- Owners/admins always; managers only when the outlet allows it.
create or replace function private.can_see_pay(p_outlet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_manage_org(private.outlet_org(p_outlet))
      or (private.can_manage_outlet(p_outlet)
          and coalesce((private.outlet_setting(p_outlet, 'team.managers_see_pay'))::boolean, false))
$$;

-- Rows a manager/owner/admin may see for the outlet, or the staff member's own.
create or replace function private.team_can_read(p_outlet uuid, p_staff uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_manage_outlet(p_outlet)
      or (p_staff is not null and p_staff = private.my_staff_id())
$$;

create or replace function private.team_can_read_pay(p_outlet uuid, p_staff uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_see_pay(p_outlet)
      or (p_staff is not null and p_staff = private.my_staff_id())
$$;

-- Fills outlet_id from staff_id so callers can't mismatch them.
create or replace function private.fill_outlet_from_staff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.outlet_id := private.staff_outlet(new.staff_id);
  if new.outlet_id is null then
    raise exception 'unknown staff %', new.staff_id;
  end if;
  return new;
end
$$;

create or replace function private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  -- Never copy secrets into the audit trail.
  v_old := v_old - 'account_number_enc';
  v_new := v_new - 'account_number_enc';
  insert into public.audit_log (table_name, row_id, outlet_id, action, actor, before, after)
  values (tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'staff_id'),
          nullif(v_row ->> 'outlet_id', '')::uuid,
          lower(tg_op),
          (select auth.uid()),
          v_old, v_new);
  return coalesce(new, old);
end
$$;

-- ---------- Payroll lock ----------
-- A locked run never changes; corrections go into payroll_adjustments.
create or replace function private.guard_locked_payroll()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_run uuid;
  v_status text;
begin
  if tg_table_name = 'payroll_runs' then
    if old.status = 'locked' then
      raise exception 'payroll run % is locked', old.id using errcode = 'P0001';
    end if;
    return coalesce(new, old);
  end if;
  v_run := coalesce(new.payroll_run_id, old.payroll_run_id);
  select r.status into v_status from public.payroll_runs r where r.id = v_run;
  if v_status = 'locked' then
    raise exception 'payroll run % is locked', v_run using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end
$$;

create trigger payroll_runs_lock_guard before update or delete on public.payroll_runs
  for each row execute function private.guard_locked_payroll();
create trigger payroll_lines_lock_guard before insert or update or delete on public.payroll_lines
  for each row execute function private.guard_locked_payroll();

-- ---------- outlet_id integrity ----------
do $$
declare t text;
begin
  foreach t in array array[
    'staff_profiles', 'staff_bank_accounts', 'staff_skills', 'salary_structures', 'staff_documents',
    'joining_checklists', 'roster_entries', 'staff_availability', 'attendance_events', 'attendance_days',
    'leave_ledger', 'leave_requests', 'overtime_entries', 'gullak_ledger', 'gullak_streaks',
    'advances', 'advance_recoveries', 'payroll_lines', 'payroll_adjustments', 'exits', 'absconding_cases'
  ] loop
    execute format(
      'create trigger %1$s_fill_outlet before insert or update of staff_id on public.%1$I
         for each row execute function private.fill_outlet_from_staff()', t);
  end loop;
end
$$;

-- ---------- Audit triggers ----------
do $$
declare t text;
begin
  foreach t in array array[
    'outlet_settings', 'staff_profiles', 'staff_bank_accounts', 'salary_structures',
    'attendance_events', 'attendance_days', 'leave_requests', 'leave_ledger',
    'overtime_entries', 'gullak_ledger', 'advances', 'advance_recoveries',
    'payroll_runs', 'payroll_lines', 'payroll_adjustments', 'exits', 'absconding_cases'
  ] loop
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$I
         for each row execute function private.audit_row()', t);
  end loop;
end
$$;

-- ---------- Privileges ----------
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'outlet_settings', 'statutory_rates', 'state_pt_slabs', 'staff_profiles', 'staff_bank_accounts',
    'staff_skills', 'salary_structures', 'staff_documents', 'joining_checklists',
    'appointment_letter_templates', 'shift_templates', 'roster_entries', 'staff_availability',
    'staffing_minimums', 'attendance_events', 'attendance_days', 'leave_types', 'leave_ledger',
    'leave_requests', 'cover_requests', 'cover_offers', 'overtime_entries', 'gullak_ledger',
    'gullak_streaks', 'advances', 'advance_recoveries', 'payroll_runs', 'payroll_lines',
    'payroll_adjustments', 'parallel_run_uploads', 'exits', 'absconding_cases', 'notifications',
    'push_subscriptions', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end
$$;

-- Read access for every team table (RLS decides which rows).
grant select on
  public.outlet_settings, public.statutory_rates, public.state_pt_slabs, public.staff_profiles,
  public.staff_skills, public.salary_structures, public.staff_documents, public.joining_checklists,
  public.appointment_letter_templates, public.shift_templates, public.roster_entries,
  public.staff_availability, public.staffing_minimums, public.attendance_events, public.attendance_days,
  public.leave_types, public.leave_ledger, public.leave_requests, public.cover_requests,
  public.cover_offers, public.overtime_entries, public.gullak_ledger, public.gullak_streaks,
  public.advances, public.advance_recoveries, public.payroll_runs, public.payroll_lines,
  public.payroll_adjustments, public.parallel_run_uploads, public.exits, public.absconding_cases,
  public.notifications, public.push_subscriptions, public.audit_log
to authenticated;
-- Bank: everything except the ciphertext.
grant select (staff_id, outlet_id, account_holder_name, account_last4, ifsc, updated_at)
  on public.staff_bank_accounts to authenticated;

-- Direct writes for managers/owners on configuration and workflow tables.
-- Ledgers, attendance, payroll lines, Gullak, bank and audit rows are
-- written only by security-definer RPCs or the server (service role).
grant insert, update, delete on
  public.outlet_settings, public.staff_skills, public.salary_structures, public.staff_documents,
  public.joining_checklists, public.appointment_letter_templates, public.shift_templates,
  public.roster_entries, public.staff_availability, public.staffing_minimums, public.leave_types,
  public.cover_requests, public.payroll_adjustments, public.parallel_run_uploads, public.exits,
  public.absconding_cases
to authenticated;
grant insert, update on public.staff_profiles to authenticated;
grant insert, update on public.payroll_runs to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert, delete on public.push_subscriptions to authenticated;

-- ---------- Policies ----------

-- Settings: managers read and write their outlets' settings.
create policy outlet_settings_select on public.outlet_settings for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy outlet_settings_write on public.outlet_settings for all to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));

-- Statutory reference data: any management login reads; only PeerCo admin edits.
create policy statutory_rates_select on public.statutory_rates for select to authenticated
  using (private.my_role() in ('peerco_admin', 'owner', 'manager'));
create policy state_pt_slabs_select on public.state_pt_slabs for select to authenticated
  using (private.my_role() in ('peerco_admin', 'owner', 'manager'));
grant insert, update, delete on public.statutory_rates, public.state_pt_slabs to authenticated;
create policy statutory_rates_admin on public.statutory_rates for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy state_pt_slabs_admin on public.state_pt_slabs for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Org-level templates.
create policy letter_templates_select on public.appointment_letter_templates for select to authenticated
  using (private.is_admin() or (private.my_role() in ('owner', 'manager') and organization_id = private.my_org()));
create policy letter_templates_write on public.appointment_letter_templates for all to authenticated
  using (private.can_manage_org(organization_id)) with check (private.can_manage_org(organization_id));

-- Outlet-wide configuration: managers only (staff and tablets never read these directly).
do $$
declare t text;
begin
  foreach t in array array['shift_templates', 'staffing_minimums', 'leave_types', 'cover_requests'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (private.can_manage_outlet(outlet_id))', t);
    execute format(
      'create policy %1$s_write on public.%1$I for all to authenticated
         using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id))', t);
  end loop;
end
$$;

-- Per-person tables: managers see the outlet, staff see their own.
do $$
declare t text;
begin
  foreach t in array array[
    'staff_profiles', 'staff_skills', 'staff_documents', 'joining_checklists', 'roster_entries',
    'staff_availability', 'attendance_events', 'attendance_days', 'leave_ledger', 'leave_requests',
    'cover_offers', 'overtime_entries', 'gullak_ledger', 'gullak_streaks', 'advances',
    'advance_recoveries', 'exits', 'absconding_cases'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (private.team_can_read(outlet_id, staff_id))', t);
  end loop;
end
$$;

-- Absconding cases are a manager tool — staff don't see their own case file.
drop policy absconding_cases_select on public.absconding_cases;
create policy absconding_cases_select on public.absconding_cases for select to authenticated
  using (private.can_manage_outlet(outlet_id));

-- Manager writes on per-person workflow tables.
do $$
declare t text;
begin
  foreach t in array array[
    'staff_skills', 'staff_documents', 'joining_checklists', 'roster_entries',
    'staff_availability', 'exits', 'absconding_cases'
  ] loop
    execute format(
      'create policy %1$s_write on public.%1$I for all to authenticated
         using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id))', t);
  end loop;
end
$$;

-- Profiles: managers insert/update. Login fields are changed only by the
-- server (create/disable login), never from the browser.
create policy staff_profiles_insert on public.staff_profiles for insert to authenticated
  with check (private.can_manage_outlet(private.staff_outlet(staff_id))
              and auth_user_id is null and login_enabled = false);
create policy staff_profiles_update on public.staff_profiles for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));
revoke update on public.staff_profiles from authenticated;
grant update (mobile, gender, date_of_birth, joining_date, employment_status, wage_type,
              is_part_timer_on_call, uan, esic_ip_number, pf_on_actual_wages,
              emergency_contact_name, emergency_contact_phone, late_shift_consent,
              late_shift_consent_at, transport_note, updated_at)
  on public.staff_profiles to authenticated;

-- Pay data: owners/admins (and managers if allowed) plus the person themself.
do $$
declare t text;
begin
  foreach t in array array['salary_structures', 'payroll_lines', 'payroll_adjustments', 'staff_bank_accounts'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (private.team_can_read_pay(outlet_id, staff_id))', t);
  end loop;
end
$$;
create policy salary_structures_write on public.salary_structures for all to authenticated
  using (private.can_see_pay(outlet_id)) with check (private.can_see_pay(outlet_id));
create policy payroll_adjustments_write on public.payroll_adjustments for all to authenticated
  using (private.can_see_pay(outlet_id)) with check (private.can_see_pay(outlet_id));

-- Payroll runs: managers see status/totals; only pay-viewers create or move them.
create policy payroll_runs_select on public.payroll_runs for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy payroll_runs_insert on public.payroll_runs for insert to authenticated
  with check (private.can_see_pay(outlet_id) and status = 'draft');
create policy payroll_runs_update on public.payroll_runs for update to authenticated
  using (private.can_see_pay(outlet_id)) with check (private.can_see_pay(outlet_id));
create policy parallel_run_uploads_select on public.parallel_run_uploads for select to authenticated
  using (private.can_see_pay(outlet_id));
create policy parallel_run_uploads_write on public.parallel_run_uploads for all to authenticated
  using (private.can_see_pay(outlet_id)) with check (private.can_see_pay(outlet_id));

-- Notifications and push subscriptions: your own only.
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_profile_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_profile_id = (select auth.uid())) with check (recipient_profile_id = (select auth.uid()));
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Audit log: owners/admins for their outlets (managers see their outlets too).
create policy audit_log_select on public.audit_log for select to authenticated
  using (private.is_admin() or (outlet_id is not null and private.can_manage_outlet(outlet_id)));

-- Staff with a phone login can read their own staff row (name, outlet).
create policy staff_select_self on public.staff for select to authenticated
  using (id = private.my_staff_id());

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('attendance-photos', 'attendance-photos', false, 1048576, array['image/jpeg', 'image/webp']),
  ('staff-documents', 'staff-documents', false, 5242880,
   array['image/jpeg', 'image/webp', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- Both buckets use {outlet_id}/{staff_id}/... paths.
create or replace function private.path_segment_uuid(p_name text, p_index int)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return ((string_to_array(p_name, '/'))[p_index])::uuid;
exception when others then
  return null;
end
$$;
revoke execute on function private.path_segment_uuid(text, int) from public, anon;
grant execute on function private.path_segment_uuid(text, int) to authenticated;

-- Attendance selfies: the outlet tablet uploads; managers and the person view.
create policy attendance_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attendance-photos'
              and private.can_access_outlet(private.path_segment_uuid(name, 1))
              and private.staff_outlet(private.path_segment_uuid(name, 2)) = private.path_segment_uuid(name, 1));
create policy attendance_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'attendance-photos'
         and private.team_can_read(private.path_segment_uuid(name, 1), private.path_segment_uuid(name, 2)));

-- Staff documents (signed letters, leave proofs): managers upload/view; the
-- person can view theirs and upload their own leave proof.
create policy staff_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-documents'
              and private.staff_outlet(private.path_segment_uuid(name, 2)) = private.path_segment_uuid(name, 1)
              and private.team_can_read(private.path_segment_uuid(name, 1), private.path_segment_uuid(name, 2)));
create policy staff_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'staff-documents'
         and private.team_can_read(private.path_segment_uuid(name, 1), private.path_segment_uuid(name, 2)));

-- ---------- Statutory reference data (verify every value with the CA) ----------
insert into public.statutory_rates (key, state, effective_from, value, verify, note) values
  ('pf.employee_rate',        null, '2026-04-01', '{"bps": 1200}',      true, 'Employee PF, % of PF wages'),
  ('pf.employer_eps_rate',    null, '2026-04-01', '{"bps": 833}',       true, 'EPS share of employer 12%, on wages up to the ceiling'),
  ('pf.employer_epf_rate',    null, '2026-04-01', '{"bps": 367}',       true, 'EPF share of employer 12%'),
  ('pf.wage_ceiling',         null, '2026-04-01', '{"paise": 1500000}', true, 'PF wage ceiling, ₹15,000/month'),
  ('esic.employee_rate',      null, '2026-04-01', '{"bps": 75}',        true, 'Employee ESIC, % of gross wages'),
  ('esic.employer_rate',      null, '2026-04-01', '{"bps": 325}',       true, 'Employer ESIC, % of gross wages'),
  ('esic.gross_ceiling',      null, '2026-04-01', '{"paise": 2100000}', true, 'ESIC coverage limit, ₹21,000/month gross'),
  ('esic.low_wage_daily_limit', null, '2026-04-01', '{"paise": 17600}', true, 'Average daily wage up to ₹176: no employee share'),
  ('wages.excluded_cap',      null, '2026-04-01', '{"bps": 5000}',      true, 'Labour-code rule: excluded allowances above 50% are added back to wages'),
  ('tds.flag_annual_gross',   null, '2026-04-01', '{"paise": 120000000}', true, 'Flag staff whose projected annual gross crosses ₹12,00,000 (TDS out of scope)');

-- Maharashtra PT (monthly). Feb row = ₹300 instead of ₹200. Verify with CA.
insert into public.state_pt_slabs (state, effective_from, gender, month, min_gross_paise, max_gross_paise, pt_paise, verify) values
  ('MH', '2026-04-01', 'male',   null, 0,        750000,  0,     true),
  ('MH', '2026-04-01', 'male',   null, 750001,   1000000, 17500, true),
  ('MH', '2026-04-01', 'male',   null, 1000001,  null,    20000, true),
  ('MH', '2026-04-01', 'male',   2,    1000001,  null,    30000, true),
  ('MH', '2026-04-01', 'female', null, 0,        2500000, 0,     true),
  ('MH', '2026-04-01', 'female', null, 2500001,  null,    20000, true),
  ('MH', '2026-04-01', 'female', 2,    2500001,  null,    30000, true);
-- Chhattisgarh (CG) slabs are intentionally not seeded: enter them in Team
-- settings once the CA confirms them. Payroll refuses to compute PT for a
-- state with no slabs rather than guessing.
