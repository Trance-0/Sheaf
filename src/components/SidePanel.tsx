"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Globe, Briefcase, ChevronRight, ChevronDown, Newspaper, Calendar } from "lucide-react";

interface EventData {
  id: string;
  title: string;
  date: string;
  description: string;
  articles: { id: string; title: string; url: string; provider: string; publishedAt: string }[];
  impactScores: { entity: string; s5d: number | null; s5w: number | null }[];
}

interface NodeData {
  id: string;
  name: string;
  type: string;
  description: string | null;
  homepage: string | null;
  jobPortal: string | null;
  recentEvents: { eventId: string; title: string; date: string; articleCount: number; impact5w: number | null }[];
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
  const [nodeData, setNodeData] = useState<NodeData | null>(null);
  const [edgeEvents, setEdgeEvents] = useState<EventData[]>([]);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setNodeData(null);
    setEdgeEvents([]);
    setExpandedEvent(null);

    if (selectedNode) {
      setLoading(true);
      fetch(`/api/node?id=${encodeURIComponent(selectedNode)}`)
        .then(r => r.json())
        .then(d => setNodeData(d))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (selectedEdge) {
      setLoading(true);
      fetch(`/api/edge?source=${encodeURIComponent(selectedEdge.source)}&target=${encodeURIComponent(selectedEdge.target)}`)
        .then(r => r.json())
        .then(d => setEdgeEvents(d.events ?? []))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [selectedNode, selectedEdge]);

  if (!selectedNode && !selectedEdge) return null;

  return (
    <aside className="w-[420px] h-full bg-slate-50/80 dark:bg-slate-900/40 backdrop-blur-xl border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col z-10 overflow-y-auto transition-transform duration-300">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent truncate pr-4">
          {selectedNode
            ? nodeData?.name || selectedNode
            : `${selectedEdge?.source} ↔ ${selectedEdge?.target}`}
        </h2>
        <button className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors flex-shrink-0" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {loading && <p className="text-sm text-gray-400 animate-pulse">Loading...</p>}

        {/* ===== NODE VIEW ===== */}
        {selectedNode && nodeData && (
          <>
            {/* Type badge */}
            <span className="inline-flex items-center self-start px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400">
              {nodeData.type}
            </span>

            {/* Description */}
            {nodeData.description && (
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{nodeData.description}</p>
            )}

            {/* Links: Homepage + Job Portal */}
            <div className="flex flex-col gap-2">
              {nodeData.homepage && (
                <a href={nodeData.homepage} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10 transition-colors text-sm text-gray-700 dark:text-gray-200">
                  <Globe size={14} className="text-blue-500 flex-shrink-0" />
                  <span className="truncate">{nodeData.homepage}</span>
                  <ExternalLink size={12} className="text-gray-400 ml-auto flex-shrink-0" />
                </a>
              )}
              {nodeData.jobPortal && (
                <a href={nodeData.jobPortal} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10 transition-colors text-sm text-gray-700 dark:text-gray-200">
                  <Briefcase size={14} className="text-emerald-500 flex-shrink-0" />
                  <span className="truncate">Job Portal</span>
                  <ExternalLink size={12} className="text-gray-400 ml-auto flex-shrink-0" />
                </a>
              )}
            </div>

            {/* Recent events for this entity */}
            {nodeData.recentEvents.length > 0 && (
              <div className="mt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Recent Events</h3>
                <ul className="flex flex-col gap-1.5">
                  {nodeData.recentEvents.map(ev => (
                    <li key={ev.eventId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-700 dark:text-gray-200">
                      <Calendar size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate flex-1">{ev.title}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{new Date(ev.date).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ===== EDGE VIEW ===== */}
        {selectedEdge && !loading && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {edgeEvents.length} event(s) linking these entities
            </p>

            <ul className="flex flex-col gap-2">
              {edgeEvents.map(event => {
                const isExpanded = expandedEvent === event.id;
                return (
                  <li key={event.id} className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    {/* Event header — click to expand */}
                    <button
                      onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                      className="w-full flex items-center gap-2 px-4 py-3 bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{event.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(event.date).toLocaleDateString()} · {event.articles.length} source(s)</p>
                      </div>
                    </button>

                    {/* Expanded: description + articles */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-200 dark:border-white/10 bg-white/30 dark:bg-black/10">
                        {event.description && (
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 mb-3">{event.description}</p>
                        )}

                        {/* Impact scores */}
                        {event.impactScores.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {event.impactScores.map(s => (
                              <span key={s.entity} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-300">
                                {s.entity}: <span className={`font-bold ${(s.s5w ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : (s.s5w ?? 0) < 0 ? 'text-red-500' : 'text-gray-400'}`}>{s.s5w ?? '—'}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Articles list */}
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Sources</h4>
                        <ul className="flex flex-col gap-1">
                          {event.articles.map(a => (
                            <li key={a.id}>
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-sm text-gray-700 dark:text-gray-200"
                              >
                                <Newspaper size={12} className="text-gray-400 flex-shrink-0" />
                                <span className="truncate flex-1">{a.title}</span>
                                <span className="text-[0.65rem] text-gray-400 flex-shrink-0">{a.provider || ''}</span>
                                <ExternalLink size={10} className="text-gray-400 flex-shrink-0" />
                              </a>
                            </li>
                          ))}
                          {event.articles.length === 0 && (
                            <li className="text-xs text-gray-400 italic px-3">No articles linked yet</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}

              {edgeEvents.length === 0 && (
                <li className="text-sm text-gray-400 italic">No events found for this edge.</li>
              )}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
