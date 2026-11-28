/**
 * Dates written as words when capturing a task: "Call Krause fr",
 * "morgen Bescheid geben", "Report 15.12.". A fixed list of words and
 * patterns (German and English), no guessing: what isn't on the list stays
 * part of the title.
 *
 * At the end of the text everything on the list counts. At the start only
 * full words and dates count, followed by a space or a colon; the short day
 * names (mo, di, so, do …) only with a colon ("fr: …"), since titles like
 * "So viel wie möglich" or "Do the taxes" start with them.
 */

const WEEKDAYS_FULL: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
};
const WEEKDAYS_SHORT: Record<string, number> = {
  so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseIso(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(today: string, days: number): string {
  const date = parseIso(today);
  date.setDate(date.getDate() + days);
  return iso(date);
}

function validDate(y: number, m: number, d: number): string | undefined {
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return void 0;
  return iso(date);
}

/** The date a single expression stands for, or undefined if it isn't one. `short` allows mo/di/fr…. */
export function dateForWords(words: string, today: string, short: boolean): string | undefined {
  const w = words.toLowerCase().replace(/\s+/g, " ").trim();
  if (w === "heute" || w === "today") return today;
  if (w === "morgen" || w === "tomorrow" || w === "tmr") return addDays(today, 1);
  if (w === "übermorgen" || w === "uebermorgen") return addDays(today, 2);
  const dow = parseIso(today).getDay();
  if (w === "nächste woche" || w === "naechste woche" || w === "next week") return addDays(today, ((1 - dow + 7) % 7) || 7);
  const weekday = WEEKDAYS_FULL[w] ?? (short ? WEEKDAYS_SHORT[w] : void 0);
  if (weekday !== void 0) return addDays(today, ((weekday - dow + 7) % 7) || 7);
  const inDays = /^in (\d{1,3}) (tag|tagen|tage|day|days|woche|wochen|week|weeks)$/.exec(w);
  if (inDays) return addDays(today, Number(inDays[1]) * (/^(woche|wochen|week|weeks)$/.test(inDays[2]) ? 7 : 1));
  // Day and month need the closing dot ("15.12."), so "Version 1.2" stays text.
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/.exec(w);
  if (german) {
    const d = Number(german[1]);
    const m = Number(german[2]);
    if (german[3]) return validDate(Number(german[3]), m, d);
    const year = Number(today.slice(0, 4));
    const thisYear = validDate(year, m, d);
    if (!thisYear) return validDate(year + 1, m, d);
    return thisYear >= today ? thisYear : validDate(year + 1, m, d);
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (isoMatch) return validDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  return void 0;
}

/** Short names that are also everyday words at the end of a title ("mach das so", "things to do"). */
const NOT_AT_END = new Set(["so", "do"]);

/** Candidate expressions: two words ("nächste woche", "in 3 tagen" is three) before one. */
const EXPRESSION_LENGTHS = [3, 2, 1];

export interface DateWordsResult {
  /** The title without the date words. */
  title: string;
  due?: string;
  /** The words that were read as the date, for the preview. */
  matched?: string;
}

/**
 * Finds a date written as words at the end (first) or the start of a captured
 * task. Trailing #tags stay where they are. Nothing changes when the text
 * already has a 📅 date or when only the date would be left.
 */
export function extractDateWords(text: string, today: string): DateWordsResult {
  const source = text.trim();
  if (!source || source.includes("\u{1F4C5}")) return { title: source };

  // End: "… fr", "… in 3 tagen", "… 15.12." (before any trailing #tags).
  const tail = /((?:\s+#[^\s#]+)*)$/.exec(source);
  const tags = tail ? tail[1] : "";
  const body = source.slice(0, source.length - tags.length);
  const words = body.split(/\s+/);
  for (const n of EXPRESSION_LENGTHS) {
    if (words.length <= n) continue;
    const expr = words.slice(-n).join(" ");
    // "heute morgen" means this morning, not tomorrow.
    if (n === 1 && /^morgen$/i.test(expr) && /^(heute|gestern)$/i.test(words[words.length - 2])) continue;
    if (n === 1 && NOT_AT_END.has(expr.toLowerCase())) continue;
    const due = dateForWords(expr, today, true);
    if (due) return { title: (words.slice(0, -n).join(" ") + tags).trim(), due, matched: expr };
  }

  // Start: "morgen …", "15.12. …", "fr: …" (short day names only with a colon).
  const startWords = source.split(/\s+/);
  for (const n of EXPRESSION_LENGTHS) {
    if (startWords.length <= n) continue;
    const head = startWords.slice(0, n).join(" ");
    const colon = head.endsWith(":");
    const expr = colon ? head.slice(0, -1) : head;
    // A hyphen means it's part of a word ("Montag-Meeting"), not a date.
    if (!expr || /-$/.test(expr)) continue;
    const due = dateForWords(expr, today, colon);
    if (due) return { title: startWords.slice(n).join(" ").trim(), due, matched: expr };
  }
  return { title: source };
}
