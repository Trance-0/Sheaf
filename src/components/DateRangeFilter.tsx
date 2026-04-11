"use client";

import { useMemo } from "react";
import { Calendar } from "lucide-react";

/**
 * Date range selector pinned above the graph.
 *
 * Replaces the 0.1.11 `TimeScaleBar`'s "days ago" slider with an explicit
 * start + end pair so the user can inspect any arbitrary window instead
 * of only "now minus N days".
 *
 * Uses native `<input type="date">` elements styled via Tailwind. This
 * keeps the dependency footprint at zero — we don't need an entire
 * date-picker library to pop a browser-native calendar — and inherits
 * the OS locale, keyboard nav, and accessibility behavior for free.
 *
 * The graph uses the `end` value as the "query end date" for event alpha
 * fade: edges whose events are close to `end` render at full opacity,
 * and edges whose events are far from `end` fade toward a lower floor.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

function toInputValue(date: Date): string {
  // `<input type="date">` expects YYYY-MM-DD in the local timezone.
  // Using toISOString() would convert to UTC and flip dates across
  // midnight. Build the string manually from local fields.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromInputValue(value: string): Date | null {
  // Parse YYYY-MM-DD as a local-timezone date. `new Date("2026-04-11")`
  // parses as UTC midnight which yields the previous day in western
  // timezones — hence the explicit parts.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSpan(range: DateRange): string {
  const days = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)));
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = (days / 365).toFixed(1);
  return `${years} years`;
}

export function defaultDateRange(): DateRange {
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 1);
  return { start, end };
}

export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const span = useMemo(() => formatSpan(value), [value]);

  const handleStart = (raw: string) => {
    const parsed = fromInputValue(raw);
    if (!parsed) return;
    // Clamp: start can't be after end. If the user picks a start
    // beyond the current end, we bump end to match.
    const nextEnd = parsed > value.end ? parsed : value.end;
    onChange({ start: parsed, end: nextEnd });
  };

  const handleEnd = (raw: string) => {
    const parsed = fromInputValue(raw);
    if (!parsed) return;
    // Clamp: end can't be before start.
    const nextStart = parsed < value.start ? parsed : value.start;
    onChange({ start: nextStart, end: parsed });
  };

  return (
    <div className="pointer-events-auto glass-panel rounded-xl px-5 py-3 flex items-center gap-4 min-w-[560px]">
      <div className="flex items-center gap-2 flex-shrink-0 text-gray-600 dark:text-gray-300">
        <Calendar size={16} />
        <div className="flex flex-col leading-tight">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date Range</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{span}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-1">
        <label className="flex flex-col flex-1">
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Start</span>
          <input
            type="date"
            value={toInputValue(value.start)}
            onChange={(e) => handleStart(e.target.value)}
            className="px-2 py-1.5 bg-white/60 dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-md text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
            aria-label="Start date"
          />
        </label>
        <span className="text-gray-400 dark:text-gray-500 mt-4">→</span>
        <label className="flex flex-col flex-1">
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">End</span>
          <input
            type="date"
            value={toInputValue(value.end)}
            onChange={(e) => handleEnd(e.target.value)}
            className="px-2 py-1.5 bg-white/60 dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-md text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
            aria-label="End date"
          />
        </label>
      </div>
    </div>
  );
}
