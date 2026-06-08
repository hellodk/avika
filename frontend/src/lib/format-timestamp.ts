/**
 * Centralized timestamp formatting — all times displayed in IST (Asia/Kolkata).
 *
 * Usage:
 *   import { formatTs, formatTsDate, formatTsTime, formatTsShort } from "@/lib/format-timestamp";
 *   formatTs(1775329805)        → "05 Apr 2026, 06:00:05 IST"
 *   formatTsDate(1775329805)    → "05 Apr 2026"
 *   formatTsTime(1775329805)    → "06:00:05"
 *   formatTsShort(1775329805)   → "05 Apr, 06:00 IST"
 *
 * The timezone is read from localStorage ("avika-user-settings" → display.timezone).
 * Default: "Asia/Kolkata" (IST). Supported values: "Asia/Kolkata", "UTC".
 */

function getUserTimezone(): string {
  if (typeof window === "undefined") return "Asia/Kolkata"; // SSR — default IST
  try {
    const raw = localStorage.getItem("avika-user-settings");
    if (raw) {
      const settings = JSON.parse(raw);
      const tz = settings?.display?.timezone;
      if (tz === "UTC") return "UTC";
    }
  } catch {}
  return "Asia/Kolkata"; // default IST per mandate
}

function toDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  const n = typeof input === "string" ? parseInt(input, 10) : input;
  // Heuristic: if > 1e12, it's milliseconds; if > 1e15, nanoseconds; else seconds
  if (n > 1e15) return new Date(n / 1e6);  // nanoseconds → ms
  if (n > 1e12) return new Date(n);          // milliseconds
  return new Date(n * 1000);                 // seconds
}

function istSuffix(tz: string): string {
  return tz === "Asia/Kolkata" ? " IST" : "";
}

/** Full datetime: "05 Apr 2026, 06:00:05 IST" */
export function formatTs(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleString("en-IN", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + istSuffix(tz);
}

/** Date only: "05 Apr 2026" */
export function formatTsDate(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleDateString("en-IN", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Time only: "06:00:05" */
export function formatTsTime(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleTimeString("en-IN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Short datetime: "05 Apr, 06:00 IST" */
export function formatTsShort(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  return d.toLocaleString("en-IN", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + istSuffix(tz);
}

/** Precise time with milliseconds: "06:00:05.123" */
export function formatTsPrecise(input: string | number | Date): string {
  const d = toDate(input);
  const tz = getUserTimezone();
  const base = d.toLocaleTimeString("en-IN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${base}.${ms}`;
}
