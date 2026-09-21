export type ParsedTimesResult = {
  parsed: string[]; // unique, sorted "HH:MM" 24-hour
  unrecognized: string[]; // original tokens that couldn't be understood
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseOneTime(token: string): string | null {
  const ampm = token.match(/^(\d{1,2})[:.](\d{2})([AaPp][Mm])$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const meridiem = ampm[3].toLowerCase();
    if (meridiem === "am") {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return `${pad(hour)}:${pad(minute)}`;
  }
  const plain = token.match(/^(\d{1,2})[:.](\d{2})$/);
  if (plain) {
    const hour = Number(plain[1]);
    const minute = Number(plain[2]);
    if (hour > 23 || minute > 59) return null;
    return `${pad(hour)}:${pad(minute)}`;
  }
  return null;
}

// Accepts "12:00 PM", "6.30 pm", "18:30", separated by commas, spaces or
// new lines. Joins a time and its trailing AM/PM marker before splitting
// on whitespace, so "12:00 PM 1:30 PM" splits into the right two tokens
// instead of four.
export function parsePastedTimes(input: string): ParsedTimesResult {
  const normalized = input.replace(/(\d{1,2}[:.]\d{2})\s+([AaPp][Mm])/g, "$1$2");
  const tokens = normalized
    .split(/[,\n\r\t ]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const parsedSet = new Set<string>();
  const unrecognized: string[] = [];
  for (const token of tokens) {
    const result = parseOneTime(token);
    if (result) parsedSet.add(result);
    else unrecognized.push(token);
  }
  return { parsed: Array.from(parsedSet).sort(), unrecognized };
}
