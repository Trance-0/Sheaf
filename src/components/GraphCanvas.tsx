"use client";

import { useEffect, useRef, useState } from "react";
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl, useSigma, useRegisterEvents } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import type { NodeSizeFactor } from "@/lib/useAppSettings";

interface GraphNode {
  id: string;
  label?: string;
  score?: number;
  eventCount?: number;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
}

/**
 * Maps the user's selected size-factor onto a visible sigma node radius.
 *
 * We log-scale the financial fields because market-cap and free-cash-flow
 * span orders of magnitude (billions vs low-millions), and a linear mapping
 * would make the small nodes disappear. When a node is missing the chosen
 * field we fall back to event_count so the node still shows up at all.
 */
function computeNodeSize(factor: NodeSizeFactor, n: GraphNode): number {
  const MIN = 8;
  const MAX = 40;
  const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v));

  const eventBase = clamp(8 + (n.eventCount ?? 1) * 3);

  const logScale = (v: number | null, pivot: number) => {
    if (!v || v <= 0) return null;
    // pivot is the value that should map to ~half-scale (~24)
    const logV = Math.log10(v);
    const logPivot = Math.log10(pivot);
    return clamp(8 + (logV / logPivot) * 20);
  };

  switch (factor) {
    case "market_cap": {
      // pivot ~= $100B
      const s = logScale(n.marketCapUsd, 1e11);
      return s ?? eventBase;
    }
    case "employee_count": {
      // pivot ~= 100k employees
      const s = logScale(n.employeeCount, 1e5);
      return s ?? eventBase;
    }
    case "free_cash_flow": {
      // pivot ~= $10B
      const s = logScale(n.freeCashFlow, 1e10);
      return s ?? eventBase;
    }
    case "event_count":
    default:
      return eventBase;
  }
}

/**
 * Controls layout + sigma event wiring.
 *
 * Design notes:
 *  - ForceAtlas2 only runs for a short settle window after mount, then stops.
 *    Leaving the worker running forever makes the canvas jitter and fights any
 *    attempt to drag nodes (the layout just snaps them back).
 *  - Dragging stops the layout on the first downNode (belt-and-braces in case
 *    the settle timer hasn't fired yet) and wires document-level mousemove/up
 *    so the drag keeps tracking even outside the canvas.
 */
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
  // Hold stop in a ref so event handlers reach the latest function without
  // re-registering every render.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Kick off the layout, then cut it after a short settle window.
  useEffect(() => {
    start();
    const settle = setTimeout(() => stopRef.current(), 3000);
    return () => {
      clearTimeout(settle);
      kill();
    };
  }, [start, kill]);

  // Register click + drag-start events.
  useEffect(() => {
    registerEvents({
      clickNode: (event) => onNodeClick(event.node),
      clickEdge: (event) => {
        const g = sigma.getGraph();
        onEdgeClick(g.source(event.edge), g.target(event.edge));
      },
      downNode: (event) => {
        setDraggedNode(event.node);
        sigma.getGraph().setNodeAttribute(event.node, "highlighted", true);
        // Pause layout so the drag actually sticks.
        stopRef.current();
      },
    });
  }, [registerEvents, sigma, onNodeClick, onEdgeClick]);

  // While a node is being dragged, listen for mousemove/up at the document
  // level so the drag continues even if the cursor leaves the sigma canvas.
  useEffect(() => {
    if (!draggedNode) return;
    sigma.setSetting("enableCameraPanning", false);

    const onMove = (e: MouseEvent) => {
      const pos = sigma.viewportToGraph({ x: e.clientX, y: e.clientY });
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
}: {
  onNodeClick: (id: string) => void;
  onEdgeClick: (source: string, target: string) => void;
  timeFilter: number;
  kind?: "all" | "news" | "job";
  sizeFactor?: NodeSizeFactor;
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const checkTheme = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch(`/api/graph?days=${timeFilter}&kind=${kind}`)
      .then(res => res.json())
      .then(data => {
        const g = new Graph();
        // Spread initial positions widely so FA2 isn't starting from a
        // pile in the middle of the canvas.
        data.nodes.forEach((n: GraphNode) => {
          g.addNode(n.id, {
            x: (Math.random() - 0.5) * 1000,
            y: (Math.random() - 0.5) * 1000,
            size: computeNodeSize(sizeFactor, n),
            label: n.label || n.id,
            color: (n.score ?? 0) > 0 ? "#10b981" : (n.score ?? 0) < 0 ? "#ef4444" : "#9ca3af",
          });
        });
        data.edges.forEach((e: { id: string; source: string; target: string; weight: number; impact: string; eventCount: number }) => {
          if (g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.id)) {
            g.addEdgeWithKey(e.id, e.source, e.target, {
              size: Math.min(2 + e.weight * 0.5, 10),
              color:
                e.impact === "positive"
                  ? "#10b981"
                  : e.impact === "negative"
                    ? "#ef4444"
                    : "#6b7280",
              label: `${e.eventCount} event(s)`,
            });
          }
        });
        setGraph(g);
      })
      .catch(console.error);
  }, [timeFilter, kind, sizeFactor]);

  if (!graph) return null;

  return (
    <SigmaContainer
      // Force a remount whenever the filter or graph changes so sigma +
      // layout worker start clean; without this the FA2 settle timer only
      // fires on the very first load.
      key={`${timeFilter}-${kind}-${sizeFactor}-${graph.order}-${graph.size}`}
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

      <ControlsContainer position={"bottom-right"}>
        <ZoomControl />
        <FullScreenControl />
      </ControlsContainer>
    </SigmaContainer>
  );
}
