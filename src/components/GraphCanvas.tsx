"use client";

import { useEffect, useState } from "react";
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl } from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

// Mock data generator for the initial demonstration. 
// In production, this will be fetched from Neon Postgres + AI cache edge functions.
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";

function LayoutController() {
  const { start, kill } = useWorkerLayoutForceAtlas2({ settings: { gravity: 1, slowDown: 10 } });
  useEffect(() => {
    start();
    return () => kill();
  }, [start, kill]);
  return null;
}

export default function GraphCanvas({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    fetch("/api/graph")
      .then(res => res.json())
      .then(data => {
        const g = new Graph();
        data.nodes.forEach((n: any) => {
          g.addNode(n.id, {
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: n.size || 15,
            label: n.label || n.id,
            color: n.score > 0 ? "#10b981" : n.score < 0 ? "#ef4444" : "#9ca3af",
          });
        });
        data.edges.forEach((e: any) => {
          if (!g.hasEdge(e.source, e.target)) {
             g.addEdge(e.source, e.target, {
               size: 2,
               color: e.impact === "positive" ? "rgba(16, 185, 129, 0.4)" : e.impact === "negative" ? "rgba(239, 68, 68, 0.4)" : "rgba(156, 163, 175, 0.4)",
             });
          }
        });
        setGraph(g);
      })
      .catch(console.error);
  }, []);

  if (!graph) return null;

  return (
    <SigmaContainer 
      graph={graph} 
      settings={{
        defaultNodeType: "circle",
        defaultEdgeType: "line",
        labelRenderedSizeThreshold: 10,
        labelColor: { color: "#f3f4f6" },
        labelSize: 14,
        labelWeight: "600",
        labelFont: "Inter",
      }}
      className="sigma-container"
    >
      <LayoutController />
      {/* Exposing events hook correctly using useRegisterEvents inside Sigma Container */}
      <EventsHandler onNodeClick={onNodeClick} />
      
      <ControlsContainer position={"bottom-right"}>
        <ZoomControl />
        <FullScreenControl />
      </ControlsContainer>
    </SigmaContainer>
  );
}

// Inner component for Sigma events
import { useSigma, useRegisterEvents } from "@react-sigma/core";

function EventsHandler({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  useEffect(() => {
    registerEvents({
      clickNode: (event) => {
        onNodeClick(event.node);
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
  }, [registerEvents, onNodeClick, sigma, draggedNode]);

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
