"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Search, X, ExternalLink, Calendar, Building2 } from "lucide-react";

interface JobEntry {
  id: string;
  title: string;
  date: string;
  description: string | null;
  yoe: number | null;
  agencies: { id: string; name: string; jobPortal: string | null }[];
  articles: { id: string; url: string; title: string; provider: string | null }[];
}

export default function CareerSidebar({
  onAgencyFocus,
}: {
  onAgencyFocus?: (agencyId: string) => void;
}) {
  const [agency, setAgency] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [yoeMin, setYoeMin] = useState<string>("");
  const [yoeMax, setYoeMax] = useState<string>("");
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [agencyOptions, setAgencyOptions] = useState<{ id: string; name: string }[]>([]);

  // Debounce the keyword field to avoid a fetch per keystroke
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (agency) params.set("agency", agency);
    if (debouncedQ) params.set("q", debouncedQ);
    if (yoeMin) params.set("yoeMin", yoeMin);
    if (yoeMax) params.set("yoeMax", yoeMax);

    setLoading(true);
    fetch(`/api/jobs?${params.toString()}`)
      .then(r => r.json())
      .then(d => setJobs(d.jobs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agency, debouncedQ, yoeMin, yoeMax]);

  // Derive agency dropdown options from the current result set on first unfiltered load
  useEffect(() => {
    if (agencyOptions.length === 0 && !agency && !debouncedQ && !yoeMin && !yoeMax && jobs.length > 0) {
      const seen = new Map<string, string>();
      for (const j of jobs) {
        for (const a of j.agencies) {
          if (!seen.has(a.id)) seen.set(a.id, a.name);
        }
      }
      setAgencyOptions(Array.from(seen.entries()).map(([id, name]) => ({ id, name })));
    }
  }, [jobs, agency, debouncedQ, yoeMin, yoeMax, agencyOptions.length]);

  const clearFilters = () => {
    setAgency("");
    setQ("");
    setYoeMin("");
    setYoeMax("");
  };

  const hasFilters = useMemo(() => !!(agency || q || yoeMin || yoeMax), [agency, q, yoeMin, yoeMax]);

  return (
    <aside className="w-[380px] h-full bg-slate-50/80 dark:bg-slate-900/40 backdrop-blur-xl border-r border-slate-200 dark:border-white/10 shadow-2xl flex flex-col z-10 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase size={18} className="text-blue-500" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Job Tracker</h2>
          <span className="ml-auto text-xs text-gray-400">{jobs.length} result(s)</span>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2.5">
          {/* Keyword */}
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search title, description…"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Agency */}
          <select
            value={agency}
            onChange={e => setAgency(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="">All agencies</option>
            {agencyOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {/* YOE range */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={yoeMin}
              onChange={e => setYoeMin(e.target.value)}
              placeholder="min yrs"
              className="w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <span className="text-xs text-gray-400">–</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={yoeMax}
              onChange={e => setYoeMax(e.target.value)}
              placeholder="max yrs"
              className="w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="self-start flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-sm text-gray-400 italic p-3 animate-pulse">Loading…</p>}
        {!loading && jobs.length === 0 && (
          <p className="text-sm text-gray-400 italic p-3">No jobs match these filters.</p>
        )}

        <ul className="flex flex-col gap-2">
          {jobs.map(job => (
            <li
              key={job.id}
              className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 p-3 hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
            >
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">{job.title}</p>

              <div className="flex items-center gap-2 mt-1.5 text-[0.7rem] text-gray-500 dark:text-gray-400 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={10} /> {new Date(job.date).toLocaleDateString()}
                </span>
                {job.yoe !== null && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    {job.yoe}+ yrs
                  </span>
                )}
                {job.agencies.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onAgencyFocus?.(a.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                  >
                    <Building2 size={10} /> {a.name}
                  </button>
                ))}
              </div>

              {job.description && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{job.description}</p>
              )}

              {job.articles.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {job.articles.slice(0, 3).map(a => (
                    <li key={a.id}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[0.7rem] text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors truncate"
                      >
                        <ExternalLink size={10} className="flex-shrink-0" />
                        <span className="truncate">{a.provider || a.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
