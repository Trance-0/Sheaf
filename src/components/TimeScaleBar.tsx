"use client";

import { useMemo } from "react";

/**
 * Horizontal time-range selector pinned above the graph.
 *
 * The user picks how far back the graph should look; we emit a `days`
 * value that /api/graph already understands. Ticks are chosen at
 * human-readable intervals (1wk / 1mo / 3mo / 6mo / 1yr / 2yr / 5yr / All)
 * and displayed alongside the absolute cutoff date so the filter is
 * unambiguous regardless of what "today" is.
 *
 * 9999 days is treated as "All Time" — it's the same sentinel that
 * /api/graph already treats as unbounded.
 */

interface Step {
  days: number;
  label: string;
}

const STEPS: Step[] = [
  { days: 7, label: "1wk" },
  { days: 30, label: "1mo" },
  { days: 90, label: "3mo" },
  { days: 180, label: "6mo" },
  { days: 365, label: "1yr" },
  { days: 730, label: "2yr" },
  { days: 1825, label: "5yr" },
  { days: 9999, label: "All" },
];

function findStepIndex(days: number): number {
  const idx = STEPS.findIndex(s => s.days === days);
  return idx >= 0 ? idx : STEPS.length - 1;
}

function cutoffDateLabel(days: number): string {
  if (days >= 9999) return "the beginning";
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function TimeScaleBar({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  const currentIndex = useMemo(() => findStepIndex(value), [value]);
  const cutoff = useMemo(() => cutoffDateLabel(value), [value]);

  return (
    <div className="pointer-events-auto glass-panel rounded-xl px-5 py-3 flex items-center gap-5 min-w-[560px]">
      <div className="flex flex-col leading-tight flex-shrink-0">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Showing since</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{cutoff}</span>
      </div>

      <div className="flex flex-col flex-1 gap-1">
        <input
          type="range"
          min={0}
          max={STEPS.length - 1}
          step={1}
          value={currentIndex}
          onChange={e => onChange(STEPS[parseInt(e.target.value, 10)].days)}
          className="w-full accent-blue-500 cursor-pointer"
          aria-label="Time range filter"
        />
        <div className="flex justify-between text-[0.65rem] font-medium text-gray-500 dark:text-gray-400 select-none">
          {STEPS.map((s, i) => (
            <button
              key={s.days}
              onClick={() => onChange(s.days)}
              className={`px-1 transition-colors ${i === currentIndex ? "text-blue-600 dark:text-blue-400 font-bold" : "hover:text-gray-800 dark:hover:text-gray-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
