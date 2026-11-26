// Daybook Team strings. English is required; Hindi and Marathi are optional
// and fall back to English until a translator fills them in — add `hi`/`mr`
// next to `en` on any row. Keys all start with "team.".

type TeamEntry = { en: string; hi?: string; mr?: string };

export const teamDictionary = {
  // ---- Nav and page ----
  "team.nav.settings": { en: "Team settings" },
  "team.settings.heading": { en: "Team settings" },
  "team.settings.intro": {
    en: "Rules for attendance, cover, Gullak and payroll at this outlet. Anything you don't change uses the default.",
  },
  "team.settings.chooseOutlet": { en: "Choose an outlet to see its Team settings." },
  "team.settings.verifyBadge": { en: "Verify with CA" },
  "team.settings.verifyHelp": {
    en: "This value has legal or tax impact. Confirm it with your CA before relying on it.",
  },
  "team.settings.default": { en: "Default: {value}" },
  "team.settings.custom": { en: "Changed for this outlet" },
  "team.settings.reset": { en: "Use default" },
  "team.settings.saved": { en: "Saved" },
  "team.settings.invalid": { en: "That value isn't allowed here." },
  "team.settings.loadError": { en: "Couldn't load settings: {error}" },
  "team.settings.yes": { en: "On" },
  "team.settings.no": { en: "Off" },
  "team.settings.listHint": { en: "Separate values with commas" },
  "team.settings.verifyCount": { en: "{count} values to verify with your CA" },

  // ---- Groups ----
  "team.settings.group.access": { en: "Access and PINs" },
  "team.settings.group.attendance": { en: "Attendance" },
  "team.settings.group.hours": { en: "Working hours and limits" },
  "team.settings.group.cover": { en: "Cover and overtime" },
  "team.settings.group.gullak": { en: "Gullak" },
  "team.settings.group.leave": { en: "Leave" },
  "team.settings.group.advances": { en: "Advances" },
  "team.settings.group.payroll": { en: "Payroll" },
  "team.settings.group.exits": { en: "Exits" },

  // ---- Units ----
  "team.unit.minutes": { en: "min" },
  "team.unit.hours": { en: "h" },
  "team.unit.days": { en: "days" },
  "team.unit.months": { en: "months" },
  "team.unit.count": { en: "" },
  "team.unit.percent": { en: "%" },

  // ---- Enum option labels ----
  "team.option.down": { en: "Round down" },
  "team.option.nearest": { en: "Round to nearest" },
  "team.option.up": { en: "Round up" },
  "team.option.fixed_26": { en: "26 days a month" },
  "team.option.calendar_days": { en: "Days in the month" },
  "team.option.rostered_days": { en: "Rostered days that month" },
  "team.option.first_accept": { en: "First to accept gets it" },
  "team.option.manager_pick": { en: "Manager picks from those who accepted" },
  "team.option.MH": { en: "Maharashtra" },
  "team.option.CG": { en: "Chhattisgarh" },
  "team.option.none": { en: "No professional tax" },

  // ---- Setting labels ----
  "team.setting.team.managers_see_pay": { en: "Managers can see salaries and payslips" },
  "team.setting.team.skills": { en: "Roles and skills" },
  "team.setting.auth.pin_max_attempts": { en: "Wrong PIN tries before locking" },
  "team.setting.auth.pin_lock_minutes": { en: "PIN lock time" },
  "team.setting.attendance.grace_minutes": { en: "Late after (grace)" },
  "team.setting.attendance.no_show_alert_minutes": { en: "No-show alert after shift start" },
  "team.setting.attendance.photo_retention_days": { en: "Keep check-in photos for" },
  "team.setting.attendance.rounding_minutes": { en: "Round payable time to" },
  "team.setting.attendance.rounding_mode": { en: "Rounding direction" },
  "team.setting.hours.standard_shift_minutes": { en: "Standard shift length" },
  "team.setting.hours.max_daily_minutes": { en: "Most working time in a day" },
  "team.setting.hours.max_weekly_minutes": { en: "Most working time in a week" },
  "team.setting.hours.min_rest_minutes": { en: "Least rest between shifts" },
  "team.setting.hours.women_late_cutoff": { en: "Women's late-shift cut-off (needs consent and transport after this)" },
  "team.setting.hours.working_days_basis": { en: "Working days used for the hourly rate" },
  "team.setting.cover.offer_batch_size": { en: "Staff asked at once" },
  "team.setting.cover.offer_expiry_minutes": { en: "Escalate if nobody accepts within" },
  "team.setting.cover.award_mode": { en: "Who gets the cover" },
  "team.setting.cover.ot_multiplier_bps": { en: "Overtime pay (% of the normal hourly rate)" },
  "team.setting.cover.comp_off_instead_of_pay": { en: "Allow comp-off instead of overtime pay" },
  "team.setting.gullak.enabled": { en: "Gullak is on" },
  "team.setting.gullak.level_start_days": { en: "Level starts on day" },
  "team.setting.gullak.level_amounts_paise": { en: "Daily amount per level (₹)" },
  "team.setting.gullak.top_level_enabled": { en: "Top level (day 90+) is on" },
  "team.setting.gullak.monthly_cap_paise": { en: "Most Gullak per person per month (₹)" },
  "team.setting.gullak.payable_share_bps": { en: "Paid out each month (rest unlocks later)" },
  "team.setting.gullak.unlock_months": { en: "Locked Gullak unlocks at (months of service)" },
  "team.setting.gullak.forfeit_locked_on_absconding": { en: "Locked Gullak is forfeited if someone absconds" },
  "team.setting.leave.encashment_on_exit": { en: "Pay unused paid leave at exit" },
  "team.setting.advances.cap_bps_of_earned": { en: "Advance limit (of pay earned so far this month)" },
  "team.setting.advances.max_recovery_months": { en: "Recover an advance over at most" },
  "team.setting.payroll.pt_state": { en: "Professional tax state" },
  "team.setting.payroll.deductions_cap_bps": { en: "Total deductions limit (of gross pay)" },
  "team.setting.payroll.wages_rule_enabled": { en: "Apply the 50% wages rule (labour codes)" },
  "team.setting.exits.notice_period_days": { en: "Notice period" },
  "team.setting.exits.absconding_days": { en: "Flag as possibly absconding after missed rostered days" },
} satisfies Record<`team.${string}`, TeamEntry>;

export type TeamTranslationKey = keyof typeof teamDictionary;
