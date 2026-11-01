"use client";
import { CalendarClock, CalendarX2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { daysBetween, formatDay } from "@/i18n";
import { cn } from "@/lib/cn";

/** Due date with text + icon (never color alone). */
export function DueLabel({ date, today, done, className }: { date: string | null; today: string; done?: boolean; className?: string }) {
  const { t, locale } = useI18n();
  if (!date) return null;
  const diff = daysBetween(today, date);
  const overdue = !done && diff < 0;
  const label = diff === 0 ? t("common.today") : diff === 1 ? t("common.tomorrow") : diff === -1 ? t("common.yesterday") : formatDay(date, locale);
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 whitespace-nowrap text-xs ltr:font-mono ltr:text-[0.6875rem]",
        overdue ? "font-medium text-danger" : diff <= 1 && !done ? "text-warning" : "text-muted",
        className,
      )}
      title={formatDay(date, locale, { year: "numeric", weekday: "short" })}
    >
      {overdue ? <CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" /> : <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />}
      {overdue ? <span className="sr-only">{t("common.overdueBy")}: </span> : null}
      {label}
    </span>
  );
}
