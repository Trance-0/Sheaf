"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import SidePanel from "@/components/SidePanel";
import SettingsPanel from "@/components/SettingsPanel";
import CareerSidebar from "@/components/CareerSidebar";
import { Settings, TrendingUp, Briefcase, Calendar, Newspaper } from "lucide-react";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm z-50 text-white">Loading Knowledge Graph...</div>,
});

type TabKind = "money" | "news" | "career";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKind>("money");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [timeFilter, setTimeFilter] = useState<number>(30);

  // Map each tab to the graph `kind` filter consumed by /api/graph
  const graphKind: "all" | "news" | "job" =
    activeTab === "news" ? "news" : activeTab === "career" ? "job" : "all";

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
      {/* Top Bar for Tabs */}
      <div className="absolute top-6 left-6 z-10 flex gap-3">
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "money" ? "bg-blue-500/20 border border-blue-500/50 text-blue-600 dark:text-blue-400" : "glass-panel text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10"}`}
          onClick={() => setActiveTab("money")}
        >
          <TrendingUp size={16} /> Money (Financial)
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "news" ? "bg-blue-500/20 border border-blue-500/50 text-blue-600 dark:text-blue-400" : "glass-panel text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10"}`}
          onClick={() => setActiveTab("news")}
        >
          <Newspaper size={16} /> News
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "career" ? "bg-blue-500/20 border border-blue-500/50 text-blue-600 dark:text-blue-400" : "glass-panel text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10"}`}
          onClick={() => setActiveTab("career")}
        >
          <Briefcase size={16} /> Career (My Time)
        </button>

        {/* Time Filter Dropdown */}
        <div className="relative group">
          <button className="glass-panel flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10 transition-all">
            <Calendar size={16} />
            {timeFilter === 5 ? "5 Days" : timeFilter === 35 ? "5 Weeks" : timeFilter === 150 ? "5 Months" : "All Time"}
          </button>
          <div className="absolute top-full mt-2 left-0 w-32 hidden group-hover:flex flex-col glass-panel rounded-lg overflow-hidden">
            {[5, 35, 150, 9999].map(days => (
              <button
                key={days}
                onClick={() => setTimeFilter(days)}
                className={`px-4 py-2 text-sm text-left hover:bg-slate-200 dark:hover:bg-slate-700 ${timeFilter === days ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-200'}`}
              >
                {days === 5 ? "5 Days" : days === 35 ? "5 Weeks" : days === 150 ? "5 Months" : "All Time"}
              </button>
            ))}
          </div>
        </div>

        <button
          className="glass-panel flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10 transition-all"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={16} /> Settings
        </button>
      </div>

      {/* Career sidebar (only in Career tab) */}
      {activeTab === "career" && (
        <CareerSidebar onAgencyFocus={handleNodeClick} />
      )}

      {/* Main Graph Area */}
      <section className="flex-1 relative">
        <GraphCanvas
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          timeFilter={timeFilter}
          kind={graphKind}
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
