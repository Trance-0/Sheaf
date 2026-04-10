"use client";

import { useEffect, useState } from "react";
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl, useSigma, useRegisterEvents } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";

function LayoutController() {
  const { start, kill } = useWorkerLayoutForceAtlas2({ settings: { gravity: 1, slowDown: 10 } });
  useEffect(() => {
    start();
    return () => kill();
  }, [start, kill]);
  return null;
}

export default function GraphCanvas({
  onNodeClick,
  onEdgeClick,
  timeFilter,
}: {
  onNodeClick: (id: string) => void;
  onEdgeClick: (source: string, target: string) => void;
  timeFilter: number;
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const checkTheme = () => setIsDarkMode(!document.body.classList.contains("light-theme"));
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch(`/api/graph?days=${timeFilter}`)
      .then(res => res.json())
      .then(data => {
        const g = new Graph();
        data.nodes.forEach((n: any) => {
          g.addNode(n.id, {
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.min(n.size || 15, 40),
            label: n.label || n.id,
            color: n.score > 0 ? "#10b981" : n.score < 0 ? "#ef4444" : "#9ca3af",
          });
        });
        data.edges.forEach((e: any) => {
          if (g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.id)) {
            g.addEdgeWithKey(e.id, e.source, e.target, {
              size: Math.min(2 + e.weight * 0.5, 10),
              color:
                e.impact === "positive"
                  ? "rgba(16, 185, 129, 0.6)"
                  : e.impact === "negative"
                    ? "rgba(239, 68, 68, 0.6)"
                    : "rgba(156, 163, 175, 0.6)",
              label: `${e.eventCount} event(s)`,
            });
          }
        });
        setGraph(g);
      })
      .catch(console.error);
  }, [timeFilter]);

  if (!graph) return null;

  return (
    <SigmaContainer
      graph={graph}
      settings={{
        enableEdgeEvents: true,
        defaultNodeType: "circle",
        defaultEdgeType: "line",
        labelRenderedSizeThreshold: 10,
        labelColor: { color: isDarkMode ? "#f8fafc" : "#111827" },
        labelSize: 14,
        labelWeight: "600",
        labelFont: "Inter",
      }}
      className="sigma-container"
    >
      <LayoutController />
      <EventsHandler onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} />

      <ControlsContainer position={"bottom-right"}>
        <ZoomControl />
        <FullScreenControl />
      </ControlsContainer>
    </SigmaContainer>
  );
}

function EventsHandler({
  onNodeClick,
  onEdgeClick,
}: {
  onNodeClick: (id: string) => void;
  onEdgeClick: (source: string, target: string) => void;
}) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  useEffect(() => {
    registerEvents({
      clickNode: (event) => {
        onNodeClick(event.node);
      },
      clickEdge: (event) => {
        const graph = sigma.getGraph();
        const source = graph.source(event.edge);
        const target = graph.target(event.edge);
        onEdgeClick(source, target);
      },
      downNode: (e) => {
        setDraggedNode(e.node);
        sigma.getGraph().setNodeAttribute(e.node, "highlighted", true);
      },
      mouseup: () => {
        if (draggedNode) {
          sigma.getGraph().removeNodeAttribute(draggedNode, "highlighted");
          setDraggedNode(null);
        }
      },
    });
  }, [registerEvents, onNodeClick, onEdgeClick, sigma, draggedNode]);

  useEffect(() => {
    if (draggedNode) {
      sigma.setSetting("enableCameraPanning", false);
      const onMouseMove = (e: MouseEvent) => {
        const pos = sigma.viewportToGraph({ x: e.clientX, y: e.clientY });
        sigma.getGraph().setNodeAttribute(draggedNode, "x", pos.x);
        sigma.getGraph().setNodeAttribute(draggedNode, "y", pos.y);
      };
      const onMouseUp = () => {
        if (draggedNode) {
          sigma.getGraph().removeNodeAttribute(draggedNode, "highlighted");
        }
        setDraggedNode(null);
        sigma.setSetting("enableCameraPanning", true);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);

      return () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
    }
  }, [draggedNode, sigma]);

  return null;
}
