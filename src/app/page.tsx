"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import SidePanel from "@/components/SidePanel";
import SettingsPanel from "@/components/SettingsPanel";
import TimeScaleBar from "@/components/TimeScaleBar";
import { useAppSettings } from "@/lib/useAppSettings";
import { Settings } from "lucide-react";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm z-50 text-white">Loading Knowledge Graph...</div>,
});

export default function Home() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Default to "All Time" so the user sees every seeded event on first load
  // instead of the handful that fall inside a 30-day window.
  const [timeFilter, setTimeFilter] = useState<number>(9999);

  // Node-size factor + theme live in a persisted settings store so they
  // survive reloads and can be exported/imported as JSON.
  const { settings } = useAppSettings();

  const handleNodeClick = (id: string) => {
    setSelectedNode(id);
    setSelectedEdge(null);
  };

  const handleEdgeClick = (source: string, target: string) => {
    setSelectedEdge({ source, target });
    setSelectedNode(null);
  };

  const closePanels = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  return (
    <main className="app-container">
      {/* Top-left title + settings. The News and Career tabs were removed in
          0.1.11 — all three categories now live in a single unified graph,
          and per-entity job drill-down is a tab inside the SidePanel. */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-3">
        <h1 className="text-lg font-semibold bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent px-4 py-2 glass-panel rounded-lg">
          Sheaf
        </h1>
        <button
          className="glass-panel flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10 transition-all"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={16} /> Settings
        </button>
      </div>

      {/* Time scale bar — always live, pinned centered at the top. */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <TimeScaleBar value={timeFilter} onChange={setTimeFilter} />
      </div>

      {/* Main Graph Area */}
      <section className="flex-1 relative">
        <GraphCanvas
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          timeFilter={timeFilter}
          sizeFactor={settings.nodeSizeFactor}
          edgeSizeFactor={settings.edgeSizeFactor}
          settings={settings}
        />
      </section>

      {/* Side Panel for Detail Cards */}
      <SidePanel
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        onClose={closePanels}
      />

      {/* Settings Modal */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </main>
  );
}
