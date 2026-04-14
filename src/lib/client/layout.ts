"use client";

import type Graph from "graphology";
import noverlap from "graphology-layout-noverlap";

/**
 * v0.1.22 — graph layout helpers.
 *
 * The default Sigma layout started with random (Math.random() - 0.5) *
 * 1000 positions and let ForceAtlas2 sort it out from there. On every
 * load the graph would rotate into a different shape and visually
 * important nodes (hubs, high-impact companies) would land wherever.
 *
 * These helpers give ForceAtlas2 a deterministic, impact-ranked seed —
 * nodes with the most connections start at the center, everything else
 * spirals out in concentric rings — and apply a no-overlap relaxation
 * after FA2 settles so nodes no longer stack on top of each other.
 */

interface RadialSeedOptions {
  /** Base ring radius in layout units. Default: 140. */
  radiusStep?: number;
  /** Rough number of nodes in ring 1. Each outer ring holds `baseRing * k`. */
  baseRing?: number;
}

/**
 * Assign (x, y) to every node based on a degree-primary, event-count
 * secondary ranking. Highest-ranked node sits at the origin; subsequent
 * nodes are placed in concentric rings of increasing radius, with each
 * ring's angle offset slightly so adjacent rings don't stack spokes.
 */
export function computeRadialSeed(
  graph: Graph,
  options: RadialSeedOptions = {},
): void {
  const radiusStep = options.radiusStep ?? 140;
  const baseRing = options.baseRing ?? 6;

  const ranked = graph.nodes().slice().sort((a, b) => {
    const byDegree = graph.degree(b) - graph.degree(a);
    if (byDegree !== 0) return byDegree;
    const ea = (graph.getNodeAttribute(a, "eventCount") as number | undefined) ?? 0;
    const eb = (graph.getNodeAttribute(b, "eventCount") as number | undefined) ?? 0;
    return eb - ea;
  });

  if (ranked.length === 0) return;

  // First node at origin.
  graph.setNodeAttribute(ranked[0], "x", 0);
  graph.setNodeAttribute(ranked[0], "y", 0);

  let placed = 1;
  let ring = 1;
  while (placed < ranked.length) {
    const capacity = baseRing * ring;
    const count = Math.min(capacity, ranked.length - placed);
    const radius = radiusStep * ring;
    // Offset alternating rings by half a slot so spokes don't align
    // with the ring below — this spreads the visual mass instead of
    // creating radial "alleys" that FA2 can't easily fix.
    const angleOffset = (ring % 2 === 0 ? 0.5 : 0) * ((2 * Math.PI) / count);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI + angleOffset;
      graph.setNodeAttribute(ranked[placed + i], "x", radius * Math.cos(angle));
      graph.setNodeAttribute(ranked[placed + i], "y", radius * Math.sin(angle));
    }
    placed += count;
    ring += 1;
  }
}

interface NoverlapOptions {
  maxIterations?: number;
  margin?: number;
  ratio?: number;
  speed?: number;
}

/**
 * Run an in-place no-overlap relaxation. Call this after ForceAtlas2
 * has settled — FA2 doesn't consider node radii, so hub regions often
 * end up with nodes stacked on top of each other. This pass nudges
 * them apart without significantly distorting the FA2 shape.
 */
export function relaxNoverlap(
  graph: Graph,
  options: NoverlapOptions = {},
): void {
  noverlap.assign(graph, {
    maxIterations: options.maxIterations ?? 120,
    settings: {
      margin: options.margin ?? 4,
      ratio: options.ratio ?? 1.1,
      speed: options.speed ?? 3,
    },
  });
}

/**
 * The FA2 settings we pass into `useWorkerLayoutForceAtlas2`. Tuned
 * against the Sheaf seed to give roughly even edge lengths and clear
 * hub regions without the layout blowing up for large date ranges.
 *
 * - `linLogMode` pulls tightly-connected clusters closer and pushes
 *   loosely-connected regions further apart — good for the "important
 *   nodes in the middle" look.
 * - `outboundAttractionDistribution` keeps big hubs from over-attracting
 *   their neighbours into a tight pile.
 * - `scalingRatio` larger => more spread, reducing edge-crossing at the
 *   cost of overall graph radius.
 * - `edgeWeightInfluence: 0` because our edge weights span several
 *   orders of magnitude (impact scores summed across events); letting
 *   that steer attraction creates a few dominant springs that drag the
 *   whole layout.
 */
export const FORCE_ATLAS2_SETTINGS = {
  gravity: 1.2,
  scalingRatio: 12,
  slowDown: 6,
  linLogMode: true,
  outboundAttractionDistribution: true,
  edgeWeightInfluence: 0,
  strongGravityMode: false,
  barnesHutOptimize: true,
  barnesHutTheta: 0.6,
};
