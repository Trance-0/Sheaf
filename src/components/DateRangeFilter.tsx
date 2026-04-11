"use client";

import { useMemo } from "react";
import { Calendar, CalendarDays } from "lucide-react";

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
 *
 * 0.1.18 — added quick-range preset chips (1W, 1M, 3M, 6M, 1Y, 3Y) and
 * gave the native inputs a more prominent icon / focus treatment so the
 * bar no longer looks like two bare browser controls glued together.
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

/**
 * Quick-range presets. Each chip snaps `start` to "end minus N
 * milliseconds" so the current end-of-window anchor is preserved — if
 * the user has `end` set to something non-today, the chip still respects
 * it rather than jumping back to now.
 *
 * The 3Y cap matches the project-level statement that "edges represent
 * news/event clusters over the past 3 years" — there's no point in
 * showing a 5Y option when the pipeline doesn't ingest anything older.
 */
interface Preset {
  label: string;
  /** Shift `end` back by this many days to produce the new start. */
  days: number;
}

const PRESETS: Preset[] = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
  { label: "3Y", days: 365 * 3 },
];

/**
 * A preset chip is "active" when the current range width matches its
 * days to within one day of tolerance (avoids flicker from DST / leap
 * years / the fact that "1M" is 30 days but reality varies). Only the
 * closest matching preset should highlight.
 */
function activePresetLabel(range: DateRange): string | null {
  const actualDays = Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
  let best: { label: string; delta: number } | null = null;
  for (const p of PRESETS) {
    const delta = Math.abs(actualDays - p.days);
    if (delta <= 1 && (!best || delta < best.delta)) best = { label: p.label, delta };
  }
  return best?.label ?? null;
}

export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const span = useMemo(() => formatSpan(value), [value]);
  const activeLabel = useMemo(() => activePresetLabel(value), [value]);

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

  const applyPreset = (days: number) => {
    const start = new Date(value.end);
    start.setDate(start.getDate() - days);
    onChange({ start, end: value.end });
  };

  return (
    <div className="pointer-events-auto glass-panel rounded-xl px-5 py-3 flex flex-col gap-2.5 min-w-[620px]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-shrink-0 text-gray-600 dark:text-gray-300">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-300">
            <CalendarDays size={16} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date Range</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{span}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1">
          <label className="flex flex-col flex-1 group">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Start</span>
            <div className="relative">
              <Calendar size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="date"
                value={toInputValue(value.start)}
                onChange={(e) => handleStart(e.target.value)}
                className="w-full pl-7 pr-2 py-2 bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-white/10 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] hover:border-slate-300 dark:hover:border-white/20 transition-all [color-scheme:light] dark:[color-scheme:dark]"
                aria-label="Start date"
              />
            </div>
          </label>
          <span className="text-gray-400 dark:text-gray-500 mt-4 select-none">→</span>
          <label className="flex flex-col flex-1 group">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">End</span>
            <div className="relative">
              <Calendar size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="date"
                value={toInputValue(value.end)}
                onChange={(e) => handleEnd(e.target.value)}
                className="w-full pl-7 pr-2 py-2 bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-white/10 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] hover:border-slate-300 dark:hover:border-white/20 transition-all [color-scheme:light] dark:[color-scheme:dark]"
                aria-label="End date"
              />
            </div>
          </label>
        </div>
      </div>

      {/* Quick-range chips. These preserve the current `end` anchor and
          only shift `start` backward by the preset's day count, so a
          user who has end pinned to, say, last week, can scrub through
          window widths without losing their anchor. */}
      <div className="flex items-center gap-1 pl-10">
        <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mr-1">Quick</span>
        {PRESETS.map((preset) => {
          const isActive = activeLabel === preset.label;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.days)}
              aria-pressed={isActive}
              className={`px-2.5 py-1 rounded-md text-[0.7rem] font-semibold tracking-wide transition-all ${
                isActive
                  ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30"
                  : "bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-500/5"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
