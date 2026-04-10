"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Activity, Target } from "lucide-react";

export default function SidePanel({ 
  selectedNode,
  selectedEdge,
  onClose 
}: { 
  selectedNode: string | null;
  selectedEdge: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // In production, this would be an API fetch for card cache details
    if (selectedNode) {
       setData({
         type: "Entity",
         title: selectedNode.toUpperCase(),
         score: "+3.2",
         description: "A major AI organization contributing to defensive cybersecurity projects inside the global infrastructure.",
         tags: ["AI", "Technology", "Cybersecurity"]
       });
    } else if (selectedEdge) {
       setData({
         type: "Event Cluster",
         title: "Project Glasswing Partnership",
         score: "Neutral",
         description: "Collaborative event connecting multiple intelligence agencies and defense contractors around Claude Mythos.",
         tags: ["DEFENSE", "COLLABORATION"]
       });
    } else {
       setData(null);
    }
  }, [selectedNode, selectedEdge]);

  if (!selectedNode && !selectedEdge) return null;

  return (
    <aside className="w-[400px] h-full bg-slate-50/80 dark:bg-slate-900/40 backdrop-blur-xl border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col z-10 overflow-y-auto transition-transform duration-300">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
          {data?.title || "Entity Intelligence"}
        </h2>
        <button className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      {/* Content Body */}
      <div className="p-6 flex flex-col gap-6">
        
        {/* Info Tags */}
        <div className="flex gap-2 flex-wrap">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400">
            {data?.type}
          </span>
          {data?.tags?.map((t: string) => (
             <span key={t} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-400">
               {t}
             </span>
          ))}
        </div>

        {/* Narrative Box */}
        <div className="bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 transition-all hover:bg-white/80 dark:hover:bg-white/10 hover:-translate-y-0.5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
            <Target size={14} /> AI Assessment
          </h3>
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {data?.description}
          </p>
        </div>

        {/* Impact Scores */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-black/5 dark:bg-black/20 rounded-lg p-3 flex flex-col items-center justify-center">
             <span className="text-[0.7rem] uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-1">Impact Score</span>
             <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{data?.score}</span>
          </div>
          <div className="bg-black/5 dark:bg-black/20 rounded-lg p-3 flex flex-col items-center justify-center">
             <span className="text-[0.7rem] uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-1">Velocity</span>
             <span className="text-xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1"><Activity size={16} /> High</span>
          </div>
        </div>

        {/* Event Connections pseudo-list */}
        <div className="mt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Linked Articles</h3>
          <ul className="flex flex-col gap-2">
            <li className="bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-3 flex items-center justify-between hover:bg-white/80 dark:hover:bg-white/10 cursor-pointer transition-colors">
               <span className="text-sm text-gray-700 dark:text-gray-200 truncate pr-4">Global Security Policy Framework</span>
               <ExternalLink size={14} className="text-gray-400 flex-shrink-0" />
            </li>
            <li className="bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-3 flex items-center justify-between hover:bg-white/80 dark:hover:bg-white/10 cursor-pointer transition-colors">
               <span className="text-sm text-gray-700 dark:text-gray-200 truncate pr-4">Tech Giants Form Intelligence Pact</span>
               <ExternalLink size={14} className="text-gray-400 flex-shrink-0" />
            </li>
          </ul>
        </div>

      </div>
    </aside>
  );
}
