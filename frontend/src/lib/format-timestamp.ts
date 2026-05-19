/**
 * Centralized timestamp formatting that respects the user's timezone preference.
 *
 * Usage:
 *   import { formatTs, formatTsDate, formatTsTime, formatTsShort } from "@/lib/format-timestamp";
 *   formatTs(1775329805)        → "Apr 05, 2026 00:30:05" (UTC) or browser-local
 *   formatTsDate(1775329805)    → "Apr 05, 2026"
 *   formatTsTime(1775329805)    → "00:30:05"
 *   formatTsShort(1775329805)   → "Apr 05, 00:30"
 *
 * The timezone is read from localStorage ("avika-user-settings" → display.timezone).
 * Values: "UTC" or "browser" (default: "browser").
 */

function getUserTimezone(): string | undefined {
  if (typeof window === "undefined") return "UTC"; // SSR — default to UTC
  try {
    const raw = localStorage.getItem("avika-user-settings");
    if (raw) {
      const settings = JSON.parse(raw);
      const tz = settings?.display?.timezone;
      if (tz === "UTC") return "UTC";
    }
  } catch {}
  return undefined; // browser default
}

function toDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  const n = typeof input === "string" ? parseInt(input, 10) : input;
  // Heuristic: if > 1e12, it's milliseconds; if > 1e15, nanoseconds; else seconds
  if (n > 1e15) return new Date(n / 1e6);  // nanoseconds → ms
  if (n > 1e12) return new Date(n);          // milliseconds
  return new Date(n * 1000);                 // seconds
}

/** Full datetime: "Apr 05, 2026 00:30:05" */
export function formatTs(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Date only: "Apr 05, 2026" */
export function formatTsDate(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleDateString("en-US", {
    timeZone: tz,
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/** Time only: "00:30:05" */
export function formatTsTime(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Short datetime: "Apr 05, 00:30" */
export function formatTsShort(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Precise time with milliseconds: "00:30:05.123" */
export function formatTsPrecise(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  const base = d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${base}.${ms}`;
}
