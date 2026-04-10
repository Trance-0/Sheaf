"use client";

import { useEffect, useState } from "react";
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl } from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

// Mock data generator for the initial demonstration. 
// In production, this will be fetched from Neon Postgres + AI cache edge functions.
const generateMockGraph = () => {
  const graph = new Graph();
  const nodes = [
    { id: "OpenAI", type: "company", score: 4, size: 25 },
    { id: "Microsoft", type: "company", score: 3, size: 20 },
    { id: "Google", type: "company", score: 2, size: 18 },
    { id: "SEC", type: "agency", score: -1, size: 15 },
    { id: "NVIDIA", type: "company", score: 5, size: 30 },
    { id: "Federal Reserve", type: "agency", score: -2, size: 22 },
  ];

  nodes.forEach((n, i) => {
    graph.addNode(n.id, {
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: n.size,
      label: n.id,
      color: n.score > 0 ? "#10b981" : n.score < 0 ? "#ef4444" : "#9ca3af",
    });
  });

  const edges = [
    { source: "OpenAI", target: "Microsoft", impact: "positive" },
    { source: "Microsoft", target: "SEC", impact: "negative" },
    { source: "Google", target: "OpenAI", impact: "neutral" },
    { source: "NVIDIA", target: "Microsoft", impact: "positive" },
    { source: "Federal Reserve", target: "Google", impact: "negative" },
  ];

  edges.forEach((e, i) => {
    graph.addEdge(e.source, e.target, {
      size: 2,
      color: e.impact === "positive" ? "rgba(16, 185, 129, 0.4)" : e.impact === "negative" ? "rgba(239, 68, 68, 0.4)" : "rgba(156, 163, 175, 0.4)",
    });
  });

  // Apply layout
  forceAtlas2.assign(graph, { iterations: 100, settings: { gravity: 10 } });
  return graph;
};

export default function GraphCanvas({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    setGraph(generateMockGraph());
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
import { useRegisterEvents } from "@react-sigma/core";

function EventsHandler({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode: (event) => {
        onNodeClick(event.node);
      },
    });
  }, [registerEvents, onNodeClick]);

  return null;
}
