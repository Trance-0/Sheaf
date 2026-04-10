"use client";

import { X, ChevronDown, Activity, Sparkles, Building, Globe } from "lucide-react";
import { useState } from "react";

export default function SidePanel({
  selectedNode,
  onClose,
}: {
  selectedNode: string | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!selectedNode) return null;

  return (
    <aside className="side-panel" style={{ transform: selectedNode ? 'translateX(0)' : 'translateX(100%)' }}>
      <div className="panel-header">
        <h2 className="panel-title">{selectedNode}</h2>
        <button className="btn-icon" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="panel-content">
        {/* Top summary card */}
        <div className="glass-card">
          <div className="header-meta flex justify-between">
            <span className="tag positive">Positive Impact</span>
            <span>Update: 2h ago</span>
          </div>
          <p className="expandable-text">
            <strong>AI Summary:</strong> {selectedNode} has shown accelerated structural growth and 
            announced major policy pivots regarding their long-term infrastructure. 
            Indicators show strong momentum in the 5-week horizon.
          </p>
          <button className="btn-icon mt-2" onClick={() => setExpanded(!expanded)} style={{ fontSize: '0.8rem', gap: '4px' }}>
            {expanded ? "Show Less" : "Expand Deep Section"} <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {expanded && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--panel-border)' }}>
              <div className="section-title">Specialized Keywords</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="tag neutral">Semiconductors</span>
                <span className="tag neutral">AI Models</span>
                <span className="tag neutral">Policy</span>
              </div>
            </div>
          )}
        </div>

        {/* Status Snapshot View */}
        <div>
          <div className="section-title">Current Status</div>
          <div className="score-grid">
            <div className="score-box">
              <span className="score-label">Net Worth</span>
              <span className="score-value">3.2T</span>
            </div>
            <div className="score-box">
              <span className="score-label">3yr Growth</span>
              <span className="score-value" style={{ color: "var(--accent-green)" }}>+245%</span>
            </div>
          </div>
        </div>

        {/* Impact Horizons Dashboard */}
        <div>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} /> Impact Timeline Forecast
          </div>
          <div className="glass-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <HorizonRow label="5 Days" impact="neutral" score="0" reason="Market consolidating pending news." />
              <HorizonRow label="5 Weeks" impact="positive" score="+3" reason="New policy alignment begins manifesting." />
              <HorizonRow label="5 Months" impact="positive" score="+8" reason="Revenue expansion mapped to current investments." />
              <HorizonRow label="5 Years" impact="negative" score="-2" reason="Regulatory friction scaling linearly with growth." />
            </div>
          </div>
        </div>

        {/* Subgraph (Placeholder for Mini Graph in Panel) */}
        <div>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} /> Related Event Cluster
          </div>
          <div className="mini-graph">
            {/* Real implementation would instantiate a smaller Sigma Canvas here */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Sub-graph View
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
}

function HorizonRow({ label, impact, score, reason }: { label: string, impact: string, score: string, reason: string }) {
  const color = impact === 'positive' ? 'var(--accent-green)' : impact === 'negative' ? 'var(--accent-red)' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{score}</span>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{reason}</p>
    </div>
  );
}
