"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Globe, Briefcase, ChevronRight, ChevronDown, Newspaper, Pencil, Check, Loader2, TrendingUp, Users, DollarSign, Calendar } from "lucide-react";
import { buildDatabaseHeaders, hasDatabaseUrl, useAppSettings } from "@/lib/useAppSettings";

interface EventData {
  id: string;
  title: string;
  date: string;
  description: string;
  articles: { id: string; title: string; url: string; provider: string; publishedAt: string }[];
  impactScores: { entity: string; s5d: number | null; s5w: number | null }[];
}

interface NodeRecentEvent {
  eventId: string;
  title: string;
  date: string;
  description: string | null;
  articleCount: number;
  primaryArticleUrl: string | null;
  primaryArticleTitle: string | null;
  primaryArticleProvider: string | null;
  impact5w: number | null;
}

interface NodeData {
  id: string;
  name: string;
  type: string;
  description: string | null;
  homepage: string | null;
  jobPortal: string | null;
  stockTicker: string | null;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
  foundedYear: number | null;
  recentEvents: NodeRecentEvent[];
  recentJobs: NodeRecentEvent[];
}

type NodeTab = "events" | "jobs";

function formatUsd(v: number | null): string | null {
  if (v === null || v === undefined) return null;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

function formatCount(v: number | null): string | null {
  if (v === null || v === undefined) return null;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${v}`;
}

export default function SidePanel({
  selectedNode,
  selectedEdge,
  onClose,
}: {
  selectedNode: string | null;
  selectedEdge: { source: string; target: string } | null;
  onClose: () => void;
}) {
  const { settings } = useAppSettings();
  const [nodeData, setNodeData] = useState<NodeData | null>(null);
  const [edgeEvents, setEdgeEvents] = useState<EventData[]>([]);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [expandedRecent, setExpandedRecent] = useState<string | null>(null);
  const [nodeTab, setNodeTab] = useState<NodeTab>("events");
  const [loading, setLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editHomepage, setEditHomepage] = useState("");
  const [editJobPortal, setEditJobPortal] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setNodeData(null);
    setEdgeEvents([]);
    setExpandedEvent(null);
    setExpandedRecent(null);
    setNodeTab("events");
    setEditing(false);
    setSaveError(null);
    setPanelError(null);

    if (!selectedNode && !selectedEdge) return;
    if (!hasDatabaseUrl(settings)) {
      setPanelError("Add your database URL in Settings before loading entity or event details.");
      return;
    }

    const headers = buildDatabaseHeaders(settings);
    if (selectedNode) {
      setLoading(true);
      fetch(`/api/node?id=${encodeURIComponent(selectedNode)}`, { headers })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Failed to load node");
          return data;
        })
        .then((data) => setNodeData(data))
        .catch((error) => setPanelError(error instanceof Error ? error.message : "Failed to load node"))
        .finally(() => setLoading(false));
    } else if (selectedEdge) {
      setLoading(true);
      fetch(`/api/edge?source=${encodeURIComponent(selectedEdge.source)}&target=${encodeURIComponent(selectedEdge.target)}`, { headers })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Failed to load edge");
          return data;
        })
        .then((data) => setEdgeEvents(data.events ?? []))
        .catch((error) => setPanelError(error instanceof Error ? error.message : "Failed to load edge"))
        .finally(() => setLoading(false));
    }
  }, [selectedNode, selectedEdge, settings]);

  const startEdit = () => {
    if (!nodeData) return;
    setEditHomepage(nodeData.homepage ?? "");
    setEditJobPortal(nodeData.jobPortal ?? "");
    setEditDescription(nodeData.description ?? "");
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!selectedNode) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/node?id=${encodeURIComponent(selectedNode)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildDatabaseHeaders(settings),
        },
        body: JSON.stringify({
          homepage: editHomepage,
          jobPortal: editJobPortal,
          description: editDescription,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Save failed (${res.status})`);
      setNodeData((prev) => prev ? {
        ...prev,
        homepage: payload.homepage,
        jobPortal: payload.jobPortal,
        description: payload.description,
      } : prev);
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!selectedNode && !selectedEdge) return null;

  return (
    <aside className="w-[420px] h-full bg-slate-50/80 dark:bg-slate-900/40 backdrop-blur-xl border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col z-10 overflow-y-auto transition-transform duration-300">
      <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent truncate pr-4">
          {selectedNode ? nodeData?.name || selectedNode : `${selectedEdge?.source} ↔ ${selectedEdge?.target}`}
        </h2>
        <button className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors flex-shrink-0" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {loading && <p className="text-sm text-gray-400 animate-pulse">Loading...</p>}
        {panelError && <p className="text-sm text-red-500 dark:text-red-400">{panelError}</p>}

        {selectedNode && nodeData && !panelError && (
          <>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400">
                {nodeData.type}
              </span>
              {!editing && (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  title="Edit entity fields"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Description</span>
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} placeholder="Short description of the entity" className="w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Homepage URL</span>
                  <input type="url" value={editHomepage} onChange={(e) => setEditHomepage(e.target.value)} placeholder="https://example.com" className="w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Job Portal URL</span>
                  <input type="url" value={editJobPortal} onChange={(e) => setEditJobPortal(e.target.value)} placeholder="https://example.com/careers" className="w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </label>
                {saveError && <p className="text-xs text-red-500 dark:text-red-400">{saveError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-sm font-medium transition-colors">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelEdit} disabled={saving} className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {nodeData.description && <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{nodeData.description}</p>}

                <div className="grid grid-cols-2 gap-3">
                  {nodeData.homepage && (
                    <a href={nodeData.homepage} target="_blank" rel="noreferrer" className="glass-panel rounded-xl p-3 flex items-center gap-3 hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                      <Globe size={16} className="text-blue-500" />
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Homepage</div>
                        <div className="text-sm font-medium truncate text-gray-800 dark:text-gray-100">Open site</div>
                      </div>
                      <ExternalLink size={14} className="ml-auto text-gray-400" />
                    </a>
                  )}
                  {nodeData.jobPortal && (
                    <a href={nodeData.jobPortal} target="_blank" rel="noreferrer" className="glass-panel rounded-xl p-3 flex items-center gap-3 hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                      <Briefcase size={16} className="text-emerald-500" />
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Jobs</div>
                        <div className="text-sm font-medium truncate text-gray-800 dark:text-gray-100">Open portal</div>
                      </div>
                      <ExternalLink size={14} className="ml-auto text-gray-400" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {nodeData.marketCapUsd !== null && (
                    <div className="glass-panel rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400"><TrendingUp size={12} /> Market Cap</div>
                      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{formatUsd(nodeData.marketCapUsd)}</div>
                    </div>
                  )}
                  {nodeData.employeeCount !== null && (
                    <div className="glass-panel rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400"><Users size={12} /> Employees</div>
                      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{formatCount(nodeData.employeeCount)}</div>
                    </div>
                  )}
                  {nodeData.freeCashFlow !== null && (
                    <div className="glass-panel rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400"><DollarSign size={12} /> Free Cash Flow</div>
                      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{formatUsd(nodeData.freeCashFlow)}</div>
                    </div>
                  )}
                  {nodeData.foundedYear !== null && (
                    <div className="glass-panel rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400"><Calendar size={12} /> Founded</div>
                      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{nodeData.foundedYear}</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-black/5 dark:bg-white/5 p-1">
                  {(["events", "jobs"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setNodeTab(tab)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${nodeTab === tab ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400"}`}
                    >
                      {tab === "events" ? "News" : "Jobs"}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  {(nodeTab === "events" ? nodeData.recentEvents : nodeData.recentJobs).map((event) => {
                    const expanded = expandedRecent === event.eventId;
                    return (
                      <div key={event.eventId} className="glass-panel rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            if (expanded && event.primaryArticleUrl) {
                              window.open(event.primaryArticleUrl, "_blank", "noopener,noreferrer");
                              return;
                            }
                            setExpandedRecent(expanded ? null : event.eventId);
                          }}
                          className="w-full px-4 py-3 flex items-start gap-3 text-left"
                        >
                          <Newspaper size={16} className="mt-0.5 text-blue-500 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{event.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(event.date).toLocaleDateString()}</div>
                          </div>
                          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                        </button>
                        {expanded && (
                          <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-300 space-y-2">
                            {event.description && <p>{event.description}</p>}
                            <div className="text-xs text-gray-500 dark:text-gray-400">Articles: {event.articleCount}</div>
                            {event.primaryArticleUrl && (
                              <a href={event.primaryArticleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                                Open primary source <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {selectedEdge && !panelError && edgeEvents.map((event) => {
          const expanded = expandedEvent === event.id;
          return (
            <div key={event.id} className="glass-panel rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedEvent(expanded ? null : event.id)}
                className="w-full px-4 py-3 flex items-start gap-3 text-left"
              >
                <Newspaper size={16} className="mt-0.5 text-blue-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{event.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(event.date).toLocaleDateString()}</div>
                </div>
                {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
              </button>
              {expanded && (
                <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-300 space-y-3">
                  {event.description && <p>{event.description}</p>}
                  {event.articles.length > 0 && (
                    <div className="space-y-2">
                      {event.articles.map((article) => (
                        <a key={article.id} href={article.url} target="_blank" rel="noreferrer" className="block rounded-lg bg-white/60 dark:bg-white/5 px-3 py-2 hover:bg-white dark:hover:bg-white/10 transition-colors">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{article.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{article.provider || "Unknown source"}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
