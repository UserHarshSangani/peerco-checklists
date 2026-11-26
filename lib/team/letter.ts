// Appointment letter: a plain-text template with {{placeholders}}, filled
// per staff member and rendered to PDF. Kept free of PDF code so it can be
// tested and previewed.

export const LETTER_PLACEHOLDERS = [
  "today",
  "staff_name",
  "mobile",
  "organization_name",
  "outlet_name",
  "outlet_city",
  "joining_date",
  "role",
  "wage_type",
  "basic",
  "da",
  "hra",
  "allowances",
  "monthly_gross",
  "daily_rate",
  "notice_period_days",
] as const;

export type LetterPlaceholder = (typeof LETTER_PLACEHOLDERS)[number];
export type LetterValues = Record<LetterPlaceholder, string>;

// Lines starting "# " are headings, "- " are bullet points, a blank line
// starts a new paragraph. Have this checked by your CA or lawyer.
export const DEFAULT_LETTER_TEMPLATE = `# Letter of appointment

Date: {{today}}

To,
{{staff_name}}
Mobile: {{mobile}}

Dear {{staff_name}},

{{organization_name}} is pleased to appoint you at {{outlet_name}}, {{outlet_city}}, as {{role}}, with effect from {{joining_date}}, on the following terms.

# Pay

Your pay is on a {{wage_type}} basis:
- Basic: {{basic}}
- Dearness allowance: {{da}}
- House rent allowance: {{hra}}
- Other allowances: {{allowances}}
- Total fixed monthly pay: {{monthly_gross}}
- Daily rate (daily-wage staff): {{daily_rate}}

Statutory deductions (PF, ESIC, professional tax) are made as the law requires. Overtime, approved leave and rewards are paid as per the outlet's policy.

# Hours and leave

You will work the shifts on the roster, with weekly offs as rostered. Leave is as per the outlet's leave policy.

# Notice

Either side may end this appointment with {{notice_period_days}} days' notice, or pay in place of notice.

Please sign and return a copy of this letter to accept these terms.

For {{organization_name}}

Authorised signatory

Accepted: ____________________   Date: ____________
{{staff_name}}
`;

// Replaces {{name}} with its value. Unknown placeholders are left as typed
// so a mistake in the template is visible on the letter.
export function fillTemplate(template: string, values: Partial<LetterValues>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) =>
    key in values && values[key as LetterPlaceholder] !== undefined ? values[key as LetterPlaceholder]! : match,
  );
}

export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(LETTER_PLACEHOLDERS);
  const found = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!known.has(m[1])) found.add(m[1]);
  return [...found];
}

export type LetterBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullets"; items: string[] };

export function parseLetter(text: string): LetterBlock[] {
  const blocks: LetterBlock[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", lines: para });
    if (bullets.length) blocks.push({ kind: "bullets", items: bullets });
    para = [];
    bullets = [];
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push({ kind: "heading", text: line.slice(2).trim() });
    } else if (line.startsWith("- ")) {
      if (para.length) flush();
      bullets.push(line.slice(2).trim());
    } else {
      if (bullets.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}
