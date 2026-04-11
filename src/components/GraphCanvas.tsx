"use client";

import { useEffect, useRef, useState } from "react";
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl, useSigma, useRegisterEvents } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import { buildDatabaseHeaders, hasDatabaseUrl, type EdgeSizeFactor, type NodeSizeFactor, type AppSettings } from "@/lib/useAppSettings";

interface GraphNode {
  id: string;
  label?: string;
  score?: number;
  eventCount?: number;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  impact: string;
  eventCount: number;
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
  timeFilter,
  kind = "all",
  sizeFactor = "event_count",
  edgeSizeFactor = "event_count",
  settings,
}: {
  onNodeClick: (id: string) => void;
  onEdgeClick: (source: string, target: string) => void;
  timeFilter: number;
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

  useEffect(() => {
    if (!hasDatabaseUrl(settings)) return;

    let cancelled = false;

    fetch(`/api/graph?days=${timeFilter}&kind=${kind}`, {
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
              color: edge.impact === "positive" ? "#10b981" : edge.impact === "negative" ? "#ef4444" : "#6b7280",
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
  }, [timeFilter, kind, sizeFactor, edgeSizeFactor, settings]);

  if (missingDatabaseMessage || error) {
    return <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-600 dark:text-gray-300">{missingDatabaseMessage || error}</div>;
  }

  if (!graph) return null;

  return (
    <SigmaContainer
      key={`${timeFilter}-${kind}-${sizeFactor}-${edgeSizeFactor}-${graph.order}-${graph.size}`}
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
