/**
 * Timezone helpers built on Intl – no external date library needed.
 * Reminder times are stored as "HH:mm" in the patient's own timezone.
 */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday as string),
  };
}

function offsetMs(date: Date, timeZone: string) {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `timeZone` to a UTC Date. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess - offsetMs(new Date(guess), timeZone));
}

/** UTC boundaries of the local calendar day that contains `date`. */
export function localDayRange(date: Date, timeZone: string) {
  const p = getZonedParts(date, timeZone);
  const start = zonedToUtc(p.year, p.month, p.day, 0, 0, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, parts: p };
}

export function parseHHmm(time: string) {
  const [h, m] = time.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
export const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

export function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** "yyyy-mm-dd" for the local day in `timeZone`. */
export function localDateKey(date: Date, timeZone: string) {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
