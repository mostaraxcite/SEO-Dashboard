import { en, type Dictionary } from "./en";
import { ar } from "./ar";

export type Locale = "en" | "ar";
export const locales: Locale[] = ["en", "ar"];
export const dictionaries: Record<Locale, Dictionary> = { en, ar };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : { [K in keyof T]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T];
export type TKey = Paths<Dictionary>;
export type Vars = Record<string, string | number | null | undefined>;

/** Resolves dotted keys, including leaf keys that themselves contain dots (e.g. "activity.task.created"). */
function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  let rest = key;
  while (rest) {
    if (typeof node !== "object" || node === null) return undefined;
    const obj = node as Record<string, unknown>;
    if (rest in obj) {
      const v = obj[rest];
      return typeof v === "string" ? v : undefined;
    }
    const dot = rest.indexOf(".");
    if (dot === -1) return undefined;
    node = obj[rest.slice(0, dot)];
    rest = rest.slice(dot + 1);
  }
  return undefined;
}

export function interpolate(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "") + "");
}

export function makeT(locale: Locale) {
  const dict = dictionaries[locale];
  function t(key: TKey, vars?: Vars): string {
    const s = lookup(dict, key) ?? lookup(en, key) ?? key;
    return interpolate(s, vars);
  }
  /** For dynamic keys built at runtime (status values, activity types). */
  t.dyn = (key: string, vars?: Vars, fallback?: string): string => {
    const s = lookup(dict, key) ?? lookup(en, key);
    return s === undefined ? (fallback ?? key) : interpolate(s, vars);
  };
  t.has = (key: string) => lookup(dict, key) !== undefined;
  return t;
}
export type T = ReturnType<typeof makeT>;

export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
export const intlLocale = (l: Locale) => (l === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB");

/** Date-only values ("2026-11-03") are formatted without time-zone shifting. */
export function formatDay(value: string | Date | null | undefined, locale: Locale, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value.length === 10 ? value + "T00:00:00Z" : value) : value;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    ...(opts ?? {}),
    timeZone: typeof value === "string" && value.length === 10 ? "UTC" : opts?.timeZone,
  }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined, locale: Locale, timeZone?: string) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(d);
}

export function formatRelative(value: Date | string, locale: Locale, now = new Date()) {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (d.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDay(d, locale, { year: "numeric" });
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function daysBetween(fromDay: string, toDay: string) {
  return Math.round((Date.parse(toDay + "T00:00:00Z") - Date.parse(fromDay + "T00:00:00Z")) / 86400000);
}
