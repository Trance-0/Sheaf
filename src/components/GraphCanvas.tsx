"use client";

import { useEffect, useRef, useState } from "react";
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl, useSigma, useRegisterEvents } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import { buildDatabaseHeaders, hasDatabaseUrl, type EdgeSizeFactor, type NodeSizeFactor, type AppSettings } from "@/lib/useAppSettings";
import { apiFetch } from "@/lib/apiFetch";
import type { DateRange } from "@/components/DateRangeFilter";

interface GraphNode {
  id: string;
  label?: string;
  score?: number;
  eventCount?: number;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
}

interface GraphEdgeEvent {
  id: string;
  title: string;
  date: string; // ISO — JSON-serialized from Prisma Date on the API
  description: string | null;
  articleCount: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  impact: string;
  eventCount: number;
  events: GraphEdgeEvent[];
}

/**
 * Map an edge's latest event date to an opacity in [0.2, 1.0], based on how
 * far back it sits inside the query window. Edges whose most recent event
 * is close to `end` render near 1.0; edges whose events all sit near
 * `start` fade toward the floor.
 *
 * We anchor to the *most recent* event on the edge, not the average, so
 * that an ongoing relationship with a fresh update still reads as "live"
 * even if it also has old history.
 */
function computeEdgeAlpha(edge: GraphEdge, range: DateRange): number {
  if (!edge.events?.length) return 1;
  const FLOOR = 0.2;
  const endMs = range.end.getTime();
  const startMs = range.start.getTime();
  const span = Math.max(1, endMs - startMs);
  // Latest event on this edge
  let latest = -Infinity;
  for (const ev of edge.events) {
    const t = new Date(ev.date).getTime();
    if (!Number.isNaN(t) && t > latest) latest = t;
  }
  if (!Number.isFinite(latest)) return 1;
  const distance = Math.max(0, endMs - latest);
  const fraction = Math.min(1, distance / span);
  return Math.max(FLOOR, 1 - fraction * (1 - FLOOR));
}

/** Base impact colors, duplicated here as RGB tuples so we can compose rgba() strings. */
const IMPACT_RGB: Record<string, [number, number, number]> = {
  positive: [16, 185, 129], // #10b981
  negative: [239, 68, 68],  // #ef4444
  neutral: [107, 114, 128], // #6b7280
};

function edgeColor(edge: GraphEdge, range: DateRange): string {
  const [r, g, b] = IMPACT_RGB[edge.impact] ?? IMPACT_RGB.neutral;
  const a = computeEdgeAlpha(edge, range);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function computeNodeSize(factor: NodeSizeFactor, node: GraphNode): number {
  const MIN = 8;
  const MAX = 40;
  const clamp = (value: number) => Math.max(MIN, Math.min(MAX, value));
  const eventBase = clamp(8 + (node.eventCount ?? 1) * 3);

  const logScale = (value: number | null, pivot: number) => {
    if (!value || value <= 0) return null;
    const logV = Math.log10(value);
    const logPivot = Math.log10(pivot);
    return clamp(8 + (logV / logPivot) * 20);
  };

  switch (factor) {
    case "market_cap":
      return logScale(node.marketCapUsd, 1e11) ?? eventBase;
    case "employee_count":
      return logScale(node.employeeCount, 1e5) ?? eventBase;
    case "free_cash_flow":
      return logScale(node.freeCashFlow, 1e10) ?? eventBase;
    case "event_count":
    default:
      return eventBase;
  }
}

function computeEdgeSize(factor: EdgeSizeFactor, edge: GraphEdge): number {
  switch (factor) {
    case "event_count":
    default:
      return Math.min(2 + edge.eventCount * 0.8, 10);
  }
}

function SigmaController({
  onNodeClick,
  onEdgeClick,
}: {
  onNodeClick: (id: string) => void;
  onEdgeClick: (source: string, target: string) => void;
}) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const { start, stop, kill } = useWorkerLayoutForceAtlas2({
    settings: { gravity: 1, slowDown: 10, barnesHutOptimize: true },
  });
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const stopRef = useRef(stop);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    start();
    const settle = setTimeout(() => stopRef.current(), 3000);
    return () => {
      clearTimeout(settle);
      kill();
    };
  }, [start, kill]);

  useEffect(() => {
    registerEvents({
      clickNode: (event) => onNodeClick(event.node),
      clickEdge: (event) => {
        const graph = sigma.getGraph();
        onEdgeClick(graph.source(event.edge), graph.target(event.edge));
      },
      downNode: (event) => {
        setDraggedNode(event.node);
        sigma.getGraph().setNodeAttribute(event.node, "highlighted", true);
        stopRef.current();
      },
    });
  }, [registerEvents, sigma, onNodeClick, onEdgeClick]);

  useEffect(() => {
    if (!draggedNode) return;
    sigma.setSetting("enableCameraPanning", false);

    const onMove = (event: MouseEvent) => {
      const pos = sigma.viewportToGraph({ x: event.clientX, y: event.clientY });
      sigma.getGraph().setNodeAttribute(draggedNode, "x", pos.x);
      sigma.getGraph().setNodeAttribute(draggedNode, "y", pos.y);
    };
    const onUp = () => {
      sigma.getGraph().removeNodeAttribute(draggedNode, "highlighted");
      setDraggedNode(null);
      sigma.setSetting("enableCameraPanning", true);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [draggedNode, sigma]);

  return null;
}

export default function GraphCanvas({
  onNodeClick,
  onEdgeClick,
  dateRange,
  kind = "all",
  sizeFactor = "event_count",
  edgeSizeFactor = "event_count",
  settings,
}: {
  onNodeClick: (id: string) => void;
  onEdgeClick: (source: string, target: string) => void;
  dateRange: DateRange;
  kind?: "all" | "news" | "job";
  sizeFactor?: NodeSizeFactor;
  edgeSizeFactor?: EdgeSizeFactor;
  settings: Pick<AppSettings, "databaseUrl">;
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const missingDatabaseMessage = !hasDatabaseUrl(settings)
    ? "Add your database URL in Settings or import a settings JSON file to load the graph."
    : null;

  useEffect(() => {
    const checkTheme = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Serialize the range to ISO strings (YYYY-MM-DD) for both the API call
  // and the effect dependency array. Using Date objects directly in the
  // deps array would refire on every render because identity changes.
  const startIso = dateRange.start.toISOString().slice(0, 10);
  const endIso = dateRange.end.toISOString().slice(0, 10);

  useEffect(() => {
    if (!hasDatabaseUrl(settings)) return;

    let cancelled = false;

    apiFetch(`/api/graph?start=${startIso}&end=${endIso}&kind=${kind}`, {
      headers: buildDatabaseHeaders(settings),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load graph");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setError(null);
        const graph = new Graph();
        data.nodes.forEach((node: GraphNode) => {
          graph.addNode(node.id, {
            x: (Math.random() - 0.5) * 1000,
            y: (Math.random() - 0.5) * 1000,
            size: computeNodeSize(sizeFactor, node),
            label: node.label || node.id,
            color: (node.score ?? 0) > 0 ? "#10b981" : (node.score ?? 0) < 0 ? "#ef4444" : "#9ca3af",
          });
        });
        data.edges.forEach((edge: GraphEdge) => {
          if (graph.hasNode(edge.source) && graph.hasNode(edge.target) && !graph.hasEdge(edge.id)) {
            graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
              size: computeEdgeSize(edgeSizeFactor, edge),
              color: edgeColor(edge, dateRange),
              label: `${edge.eventCount} event(s)`,
            });
          }
        });
        setGraph(graph);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setGraph(null);
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load graph");
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIso, endIso, kind, sizeFactor, edgeSizeFactor, settings]);

  if (missingDatabaseMessage || error) {
    return <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-600 dark:text-gray-300">{missingDatabaseMessage || error}</div>;
  }

  if (!graph) return null;

  return (
    <SigmaContainer
      key={`${startIso}-${endIso}-${kind}-${sizeFactor}-${edgeSizeFactor}-${graph.order}-${graph.size}`}
      graph={graph}
      settings={{
        enableEdgeEvents: true,
        defaultNodeType: "circle",
        defaultEdgeType: "line",
        labelRenderedSizeThreshold: 10,
        labelColor: { color: isDarkMode ? "#f8fafc" : "#111827" },
        edgeLabelColor: { color: isDarkMode ? "#94a3b8" : "#6b7280" },
        labelSize: 14,
        labelWeight: "600",
        labelFont: "Inter",
      }}
      className={isDarkMode ? "sigma-dark" : "sigma-light"}
    >
      <SigmaController onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} />
      <ControlsContainer position="bottom-right">
        <ZoomControl />
        <FullScreenControl />
      </ControlsContainer>
    </SigmaContainer>
  );
}
