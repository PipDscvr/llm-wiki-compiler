/**
 * llmwiki viewer — graph view module.
 *
 * Renders a D3 force-directed graph of wiki page links at the `#/graph`
 * route. Expects `globalThis.d3` to be set by the D3 IIFE bundle loaded
 * as a `<script>` tag in index.html before this module runs.
 *
 * Colour lives entirely in viewer-graph.css. D3 assigns semantic classes —
 * `graph-node graph-node--<kind>` on nodes, `graph-edge`/`graph-edge--relation`
 * on edges — rather than a hardcoded SVG fill/stroke presentation attribute,
 * because presentation attributes cannot read CSS custom properties: a graph
 * coloured that way would stay dark when the viewer switches to the light
 * theme. `nodeClass()` resolves the design system's four node semantics —
 * concept, entity, stale, dangling — in that priority order (a dangling
 * target has no backing page at all; a stale page outranks its kind because
 * "the source moved on" is the more urgent fact). `GraphNode` carries no
 * freshness field, so `staleIdsFromEnvelope()` joins it client-side from the
 * `/api/pages` envelope the caller already holds — both `#/graph` (viewer.js)
 * and the dashboard's compact panel (viewer-dashboard.js) pass it in.
 *
 * The canvas is deliberately label-free — no per-node `<text>` — because at
 * 128 nodes the labels overlapped into noise. Identification lives in the
 * hover tooltip (title, kind, connection count) and the legend (page
 * header). Each node group holds two circles: a halo (`.graph-halo`, drawn
 * first so it sits behind the node, invisible until hot) and the node
 * itself (`.graph-node`). Node radius and stroke width stay data-driven
 * `.attr()` calls because they come from degree and the active mode's
 * settings, not from the theme.
 *
 * Typed relation edges get the `graph-edge--relation` class and carry the
 * `relationType` as a tooltip title. Symmetric relation edges have no
 * arrowhead; directed and wikilink edges use the arrowhead marker.
 *
 * `loadGraph()` is the one entry point for two callers — the full `#/graph`
 * route and the dashboard's compact `[data-graph-panel]` — so the panel can
 * never drift into a second, decorative renderer. `options.compact` selects
 * a `MODE_SETTINGS` entry (link distance, charge, radius bounds, drag)
 * rather than forking any code path; the fetch call and the force-simulation
 * builder stay single-instance in both modes.
 */

import { emptyState } from "./viewer-dom.js";

/**
 * Force and sizing parameters per mode. Compact serves the dashboard's
 * `[data-graph-panel]` — a small, fluid-width panel (roughly half the main
 * column, collapsing to full width under 900px) about 296px tall: shorter
 * links and weaker repulsion keep the layout inside that box rather than
 * pushing most nodes out of view.
 */
const MODE_SETTINGS = {
  full:    { linkDistance: 80, charge: -200, minRadius: 4,   maxRadius: 10, drag: true },
  compact: { linkDistance: 34, charge: -60,  minRadius: 2.5, maxRadius: 6,  drag: false },
};
const ARROWHEAD_MARKER_ID   = 'llmwiki-arrowhead';
const HIGH_DEGREE_THRESHOLD = 5;

/**
 * Freshness states that colour a node amber. `GraphNode` carries no freshness
 * field, so the ids are joined from /api/pages — data the client already holds.
 */
const STALE_STATUSES = new Set(["stale", "orphaned"]);

/** True for a ghost node with no backing page — a broken wikilink or relation target. */
function isDanglingNode(d) {
  return d.isDangling === true || d.kind === "dangling";
}

/**
 * Resolve the semantic class for a node. Colour lives entirely in
 * viewer-graph.css so both themes are handled by the stylesheet — SVG
 * presentation attributes cannot read CSS custom properties.
 *
 * Order is deliberate: a dangling target has no page at all, and a stale page
 * outranks its kind because "the source moved on" is the more urgent fact.
 *
 * @param {object} d - The node datum.
 * @param {Set<string>} staleIds - Page ids whose freshness is stale or orphaned.
 */
function nodeClass(d, staleIds) {
  if (isDanglingNode(d)) return "graph-node graph-node--dangling";
  if (staleIds.has(d.id)) return "graph-node graph-node--stale";
  if (d.nodeKind === "entity") return "graph-node graph-node--entity";
  return "graph-node graph-node--concept";
}

/** The `pages` array of an /api/pages envelope, or `[]` when absent/malformed. */
function pagesFromEnvelope(envelope) {
  return Array.isArray(envelope?.pages) ? envelope.pages : [];
}

/** True when a page's computed freshness is stale or orphaned. */
function isStalePage(page) {
  return STALE_STATUSES.has(page.freshness?.freshnessStatus);
}

/**
 * Build the stale-id set from an /api/pages envelope. Returns an empty set
 * when the envelope is absent, so a failed page fetch degrades the graph to
 * kind-only colouring rather than breaking it.
 */
export function staleIdsFromEnvelope(envelope) {
  const ids = new Set();
  for (const page of pagesFromEnvelope(envelope)) {
    if (isStalePage(page)) ids.add(page.id);
  }
  return ids;
}

/** Map a node's degree to a circle radius using a linear scale. */
function radiusForDegree(degree, maxDegree, settings) {
  const { minRadius, maxRadius } = settings;
  if (maxDegree === 0) return minRadius;
  return minRadius + (degree / maxDegree) * (maxRadius - minRadius);
}

/** Build the tooltip DOM element and append it to the container. */
function buildTooltip(container) {
  const tip = document.createElement('div');
  tip.className = 'graph-tooltip';

  const title = document.createElement('div');
  title.className = 'tip-title';

  const meta = document.createElement('div');
  meta.className = 'tip-meta';

  const hint = document.createElement('div');
  hint.className = 'tip-hint';
  hint.textContent = 'Click to open page';

  tip.appendChild(title);
  tip.appendChild(meta);
  tip.appendChild(hint);
  container.appendChild(tip);
  return tip;
}

/** Position the tooltip near the cursor, keeping it within the SVG bounds. */
function positionTooltip(tooltip, event, svgEl) {
  const rect = svgEl.getBoundingClientRect();
  const size = tooltipSize(tooltip);
  const desired = {
    left: event.clientX - rect.left + 14,
    top:  event.clientY - rect.top  - 50,
  };
  const { left, top } = clampTooltipPosition(desired, size, rect);
  tooltip.style.left    = left + 'px';
  tooltip.style.top     = top  + 'px';
  tooltip.style.display = 'block';
}

/** Tooltip box dimensions with the same fallback defaults the previous inline `||` used. */
function tooltipSize(tooltip) {
  return {
    width:  tooltip.offsetWidth  || 220,
    height: tooltip.offsetHeight || 60,
  };
}

/** Clamp a tooltip's top-left so it stays within the SVG bounds with the existing margins. */
function clampTooltipPosition(pos, size, rect) {
  let { left, top } = pos;
  if (left + size.width  > rect.width)  left = rect.width  - size.width  - 8;
  if (top  < 0)                         top  = 4;
  if (top  + size.height > rect.height) top  = rect.height - size.height - 8;
  return { left, top };
}

/** Create the SVG element, a zoom-aware inner group, and the tooltip. */
function initGraph(container) {
  const d3     = globalThis.d3;
  const width  = container.clientWidth  || 800;
  const height = container.clientHeight || 600;

  const svg = d3.select(container)
    .append('svg')
    .attr('width',   '100%')
    .attr('height',  '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('cursor', 'grab');

  const g = svg.append('g');

  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => g.attr('transform', event.transform));
  svg.call(zoom);

  const tooltip = buildTooltip(container);
  return { svg, g, zoom, width, height, tooltip };
}

/** Update edge and node SVG positions after each simulation tick. */
function onTick(edgeSel, nodeSel) {
  edgeSel
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y);
  nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
}

/**
 * Dim everything, mark the hovered node and its edges hot. Each node group
 * holds two circles (halo + node), so both are targeted by class rather than
 * by tag — a bare `.select('circle')` would hit whichever circle comes
 * first in document order (the halo), not the node.
 */
function applyHighlight(hoveredId, edgeSel, nodeSel) {
  edgeSel.classed('is-dimmed', true).classed('is-hot', false);
  nodeSel.select('.graph-node').classed('is-dimmed', true).classed('is-hot', false);
  nodeSel.select('.graph-halo').classed('is-hot', false);

  edgeSel
    .filter(d => d.source.id === hoveredId || d.target.id === hoveredId)
    .classed('is-dimmed', false)
    .classed('is-hot', true);

  const hovered = nodeSel.filter(d => d.id === hoveredId);
  hovered.select('.graph-node').classed('is-dimmed', false).classed('is-hot', true);
  hovered.select('.graph-halo').classed('is-hot', true);
}

/** Clear every highlight class, including the halo. */
function resetHighlight(edgeSel, nodeSel) {
  edgeSel.classed('is-dimmed', false).classed('is-hot', false);
  nodeSel.select('.graph-node').classed('is-dimmed', false).classed('is-hot', false);
  nodeSel.select('.graph-halo').classed('is-hot', false);
}

/** Attach drag behaviour to node groups so users can reposition nodes. */
function attachDrag(nodeSel, sim) {
  nodeSel.call(globalThis.d3.drag()
    .on('start', (event, d) => {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    })
  );
}

/** Pluralize a noun by appending 's' when count !== 1. */
function plural(count, noun) {
  return count + ' ' + noun + (count !== 1 ? 's' : '');
}

/** Build the tooltip meta-line text for a node datum. */
function nodeMetaText(d) {
  if (d.isDangling) return 'missing page · ' + plural(d.degree, 'reference');
  const kindLabel = d.nodeKind === 'entity' ? 'entity · ' + d.entityType : d.kind;
  return kindLabel + ' · ' + plural(d.degree, 'connection');
}

/** Wire hover and click interactions onto node groups. */
function attachHover(nodeSel, edgeSel, tooltip, svg) {
  nodeSel
    .on('mouseenter', function(event, d) {
      applyHighlight(d.id, edgeSel, nodeSel);
      tooltip.querySelector('.tip-title').textContent = d.title;
      tooltip.querySelector('.tip-meta').textContent = nodeMetaText(d);
      positionTooltip(tooltip, event, svg.node());
    })
    .on('mousemove', function(event) {
      positionTooltip(tooltip, event, svg.node());
    })
    .on('mouseleave', function() {
      resetHighlight(edgeSel, nodeSel);
      tooltip.style.display = 'none';
    })
    .on('click', function(_event, d) {
      if (d.isDangling) return;
      location.hash = '#/' + encodeURIComponent(d.directory) + '/' + encodeURIComponent(d.slug);
    });
}

/**
 * Append the circle for each node group. Labels are absent in both modes,
 * per the design system's label-free canvas.
 *
 * @param {object} nodeSel - D3 selection of node groups.
 * @param {{maxDegree: number, staleIds: Set<string>, settings: object}} ctx - Render context.
 */
function appendNodeVisuals(nodeSel, ctx) {
  // Halo ring, drawn first so it sits behind the node. Invisible until the
  // node is hot — the design system's "focus · halo ring" semantic.
  nodeSel.append('circle')
    .attr('class', 'graph-halo')
    .attr('r',     d => radiusForDegree(d.degree, ctx.maxDegree, ctx.settings) + 9);

  nodeSel.append('circle')
    .attr('class',            d => nodeClass(d, ctx.staleIds))
    .attr('r',                d => radiusForDegree(d.degree, ctx.maxDegree, ctx.settings))
    .attr('stroke-dasharray', d => d.isDangling ? '3,2' : null)
    .attr('stroke-width',     d => d.degree > HIGH_DEGREE_THRESHOLD ? 2.5 : d.degree > 0 ? 2 : 1);
}

/** Append the arrowhead marker definition; its fill comes from the stylesheet. */
function appendArrowheadDef(svg) {
  svg.append('defs').append('marker')
    .attr('id',           ARROWHEAD_MARKER_ID)
    .attr('viewBox',      '0 -4 8 8')
    .attr('refX',         8)
    .attr('refY',         0)
    .attr('markerWidth',  6)
    .attr('markerHeight', 6)
    .attr('orient',       'auto')
    .append('path')
    .attr('class', 'graph-arrowhead')
    .attr('d',     'M0,-4L8,0L0,4');
}

/**
 * Apply structural edge styling. Colour comes from viewer-graph.css via the
 * class; only the arrowhead decision and the relation tooltip are data-driven.
 * Symmetric relations get no arrowhead; directed and wikilink edges do.
 *
 * @param {object} edgeSel - The D3 line selection bound to edge data.
 * @returns {object} The same selection (for chaining).
 */
function styleEdges(edgeSel) {
  return edgeSel
    .attr('class',      d => d.edgeKind === 'relation' ? 'graph-edge graph-edge--relation' : 'graph-edge')
    .attr('title',      d => d.edgeKind === 'relation' ? d.relationType : null)
    .attr('marker-end', d => d.direction === 'symmetric' ? null : `url(#${ARROWHEAD_MARKER_ID})`);
}

/**
 * Build and run the D3 simulation; append edges, nodes, and interactions.
 *
 * @param {{svg: object, g: object, width: number, height: number, tooltip: HTMLElement}} view -
 *   The object `initGraph()` returns — collapsed into one argument rather than
 *   five positional ones.
 * @param {{nodes: object[], edges: object[]}} data - The `/api/graph` payload.
 * @param {{compact?: boolean, staleIds?: Set<string>}} options - `compact` selects
 *   the `MODE_SETTINGS` entry; `staleIds` feeds `nodeClass()` via the render context.
 */
function renderGraph(view, data, options) {
  const d3 = globalThis.d3;
  const settings = options.compact ? MODE_SETTINGS.compact : MODE_SETTINGS.full;
  const maxDegree = Math.max(0, ...data.nodes.map(n => n.degree));
  const ctx = { maxDegree, staleIds: options.staleIds ?? new Set(), settings };

  appendArrowheadDef(view.svg);

  const sim = d3.forceSimulation(data.nodes)
    .force('link',   d3.forceLink(data.edges).id(d => d.id).distance(settings.linkDistance))
    .force('charge', d3.forceManyBody().strength(settings.charge))
    .force('center', d3.forceCenter(view.width / 2, view.height / 2));

  const edgeSel = styleEdges(view.g.append('g').selectAll('line').data(data.edges).join('line'));

  const nodeSel = view.g.append('g')
    .selectAll('g')
    .data(data.nodes)
    .join('g')
    .style('cursor', d => d.isDangling ? 'default' : 'pointer');

  appendNodeVisuals(nodeSel, ctx);
  if (settings.drag) attachDrag(nodeSel, sim);
  attachHover(nodeSel, edgeSel, view.tooltip, view.svg);

  // Stop the simulation when the SVG leaves the document (route change).
  sim.on('tick', () => {
    if (!view.svg.node().isConnected) { sim.stop(); return; }
    onTick(edgeSel, nodeSel);
  });

  return { sim, edgeSel, nodeSel };
}

/** Legend entries: label plus the node class whose swatch it shows. */
const LEGEND_KINDS = [
  { label: 'concept',  kind: 'concept' },
  { label: 'entity',   kind: 'entity' },
  { label: 'stale',    kind: 'stale' },
  { label: 'dangling', kind: 'dangling' },
];

/** Build one legend row with a class-styled swatch. */
function buildLegendItem(label, kindClass) {
  const item = document.createElement('div');
  item.className = 'graph-legend-item';
  const dot = document.createElement('div');
  dot.className = `graph-legend-dot graph-legend-dot--${kindClass}`;
  item.appendChild(dot);
  item.appendChild(document.createTextNode(label));
  return item;
}

/** Build the legend item for the relation edge kind (dashed swatch + label). */
function buildRelationLegendItem() {
  return buildLegendItem('relation', 'relation');
}

/** Append the "Edge kind" heading + the relation-edge legend item to the legend. */
function appendEdgeKindSection(legend) {
  const edgeHeading = document.createElement('div');
  edgeHeading.className = 'graph-legend-heading';
  edgeHeading.textContent = 'Edge kind';
  legend.appendChild(edgeHeading);

  legend.appendChild(buildRelationLegendItem());
}

/** Build and append the kind/size legend overlay to the container. */
function buildLegend(container) {
  const legend = document.createElement('div');
  legend.className = 'graph-legend';

  const kindHeading = document.createElement('div');
  kindHeading.className = 'graph-legend-heading';
  kindHeading.textContent = 'Node kind';
  legend.appendChild(kindHeading);

  for (const { label, kind } of LEGEND_KINDS) {
    legend.appendChild(buildLegendItem(label, kind));
  }

  appendEdgeKindSection(legend);

  const sizeHeading = document.createElement('div');
  sizeHeading.className = 'graph-legend-heading';
  sizeHeading.textContent = 'Node size';
  legend.appendChild(sizeHeading);

  const sizeNote = document.createElement('div');
  sizeNote.className = 'graph-legend-item';
  sizeNote.textContent = 'larger = more connections';
  legend.appendChild(sizeNote);

  container.appendChild(legend);
}

/** True once `/api/graph` returned at least one node to draw. */
function hasRenderableNodes(data) {
  return Boolean(data?.nodes?.length);
}

/** Show the design system empty state when the wiki has no pages yet. */
function renderEmptyState(container) {
  container.appendChild(
    emptyState(
      "Nothing to graph yet",
      "The graph draws links between compiled pages. Compile at least two pages that reference each other to see structure here.",
      "$ llmwiki compile",
    ),
  );
}

/**
 * Entry point for both the `#/graph` route (viewer.js) and the dashboard's
 * compact panel (viewer-dashboard.js). Fetches `/api/graph`, builds the SVG,
 * and starts the force simulation — the same fetch call and simulation
 * builder run in both modes; only `MODE_SETTINGS` differs.
 *
 * @param {HTMLElement} container - Element to render into.
 * @param {{compact?: boolean, staleIds?: Set<string>}} [options] - Compact mode
 *   drops the legend and drag and tightens the forces for a small panel.
 *   `staleIds` comes from `staleIdsFromEnvelope()` over the already-fetched
 *   `/api/pages` envelope; a caller that omits it gets kind-only colouring
 *   (no stale nodes highlighted).
 * @returns {Promise<void>}
 */
export async function loadGraph(container, options = {}) {
  const data = await fetchGraphData(container);
  if (!data) return;
  if (!hasRenderableNodes(data)) return renderEmptyState(container);
  renderGraph(initGraph(container), data, options);
  if (!options.compact) buildLegend(container);
}

/** Fetch /api/graph and parse JSON; render an inline error banner and return null on failure. */
async function fetchGraphData(container) {
  try {
    const res = await fetch('/api/graph', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    showGraphLoadError(container, err);
    return null;
  }
}

/** Append the "Could not load graph" warning banner with the error message. */
function showGraphLoadError(container, err) {
  const p = document.createElement('p');
  p.className = 'warning-banner';
  p.textContent = 'Could not load graph: ' + err.message;
  container.appendChild(p);
}
