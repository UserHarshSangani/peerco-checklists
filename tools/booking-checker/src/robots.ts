export const USER_AGENT = "PeercoBookingChecker/1.0 (+https://github.com/UserHarshSangani/peerco-checklists)";

type Rule = { type: "allow" | "disallow"; pattern: string };
type Group = { agents: string[]; rules: Rule[] };

function parseRobotsTxt(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let groupClosed = true; // forces the first "User-agent:" line to open a group

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || groupClosed) {
        current = { agents: [], rules: [] };
        groups.push(current);
        groupClosed = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      if (!current) continue;
      current.rules.push({ type: field, pattern: value });
      groupClosed = true;
    }
    // crawl-delay, sitemap, host, etc. are ignored — not relevant here.
  }
  return groups;
}

function patternToRegExp(pattern: string): RegExp {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${endAnchored ? "$" : ""}`);
}

function pickGroup(groups: Group[], userAgent: string): Group | undefined {
  const ua = userAgent.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  return specific ?? groups.find((g) => g.agents.includes("*"));
}

function isPathAllowedByGroup(group: Group | undefined, path: string): boolean {
  if (!group) return true;
  let bestLength = -1;
  let bestType: "allow" | "disallow" = "allow";
  for (const rule of group.rules) {
    if (rule.pattern === "") {
      // An empty Disallow means "disallow nothing" per the de-facto standard.
      if (0 > bestLength) {
        bestLength = 0;
        bestType = "allow";
      }
      continue;
    }
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    const length = rule.pattern.replace(/\$$/, "").length;
    if (length > bestLength || (length === bestLength && rule.type === "allow")) {
      bestLength = length;
      bestType = rule.type;
    }
  }
  return bestType !== "disallow";
}

export async function isPathAllowed(
  sourceUrl: string,
  path: string,
  userAgent: string,
): Promise<{ allowed: boolean; note?: string }> {
  const origin = new URL(sourceUrl).origin;
  let text: string;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": userAgent },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { allowed: true, note: `robots.txt returned ${res.status}; assuming allowed` };
    text = await res.text();
  } catch {
    return { allowed: true, note: "robots.txt unreachable; assuming allowed" };
  }

  const group = pickGroup(parseRobotsTxt(text), userAgent);
  return { allowed: isPathAllowedByGroup(group, path) };
}
