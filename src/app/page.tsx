"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import SidePanel from "@/components/SidePanel";
import { Settings, TrendingUp, Briefcase } from "lucide-react";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => <div className="loading-overlay">Loading Knowledge Graph...</div>,
});

export default function Home() {
  const [activeTab, setActiveTab] = useState<"money" | "career">("money");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <main className="app-container">
      {/* Top Bar for Tabs */}
      <div className="top-bar">
        <button
          className={`tab-btn ${activeTab === "money" ? "active" : ""}`}
          onClick={() => setActiveTab("money")}
        >
          <TrendingUp size={16} /> Money (Financial)
        </button>
        <button
          className={`tab-btn ${activeTab === "career" ? "active" : ""}`}
          onClick={() => setActiveTab("career")}
        >
          <Briefcase size={16} /> Career (My Time)
        </button>
        <button className="tab-btn" style={{ marginLeft: "auto" }}>
          <Settings size={16} /> Select Entities
        </button>
      </div>

      {/* Main Graph Area */}
      <section className="graph-section">
        <GraphCanvas onNodeClick={(id) => setSelectedNode(id)} />
      </section>

      {/* Side Panel for Detail Cards */}
      <SidePanel selectedNode={selectedNode} onClose={() => setSelectedNode(null)} />
    </main>
  );
}
