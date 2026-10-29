import { DateTime } from "luxon";

/**
 * Business-time arithmetic in the tenant's time zone.
 * workDays use ISO weekdays (1 = Monday … 7 = Sunday). Holidays are local dates.
 * Example: Asia/Riyadh, Sunday–Thursday ([7,1,2,3,4]), 08:00–17:00.
 */
export type Calendar = { timezone: string; workDays: number[]; startMinute: number; endMinute: number; holidays: string[] };

function isWorkDay(d: DateTime, cal: Calendar) {
  return cal.workDays.includes(d.weekday) && !cal.holidays.includes(d.toISODate()!);
}

/** Business minutes elapsed between two instants. */
export function businessMinutesBetween(from: Date, to: Date, cal: Calendar): number {
  if (to <= from) return 0;
  let cursor = DateTime.fromJSDate(from, { zone: cal.timezone });
  const end = DateTime.fromJSDate(to, { zone: cal.timezone });
  let total = 0;
  for (let guard = 0; guard < 3660 && cursor < end; guard++) {
    const dayStart = cursor.startOf("day");
    if (isWorkDay(cursor, cal)) {
      const open = dayStart.plus({ minutes: cal.startMinute });
      const close = dayStart.plus({ minutes: cal.endMinute });
      const s = cursor > open ? cursor : open;
      const e = end < close ? end : close;
      if (e > s) total += e.diff(s, "minutes").minutes;
    }
    cursor = dayStart.plus({ days: 1 });
  }
  return Math.floor(total);
}

/** The instant at which `minutes` business minutes have elapsed after `from`. */
export function addBusinessMinutes(from: Date, minutes: number, cal: Calendar): Date {
  let cursor = DateTime.fromJSDate(from, { zone: cal.timezone });
  let remaining = minutes;
  for (let guard = 0; guard < 3660; guard++) {
    const dayStart = cursor.startOf("day");
    if (isWorkDay(cursor, cal)) {
      const open = dayStart.plus({ minutes: cal.startMinute });
      const close = dayStart.plus({ minutes: cal.endMinute });
      const s = cursor > open ? cursor : open;
      if (s < close) {
        const available = close.diff(s, "minutes").minutes;
        if (remaining <= available) return s.plus({ minutes: remaining }).toJSDate();
        remaining -= available;
      }
    }
    cursor = dayStart.plus({ days: 1 });
  }
  throw new Error("business calendar has no working time");
}
