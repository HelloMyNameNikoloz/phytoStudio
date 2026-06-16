// Repaint the canvas node to reflect attribute/method edits once the user leaves
// the field — kept separate from typing so the textarea doesn't lose focus.
function commitNodeBodyEdits() {
  if (getSelectedNode() && state.builderType === "plantuml-class") {
    renderBuilder();
  }
}

function extractExportedNodePositions(svg) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  if (!doc.querySelector("svg")) return new Map();

  // PlantUML renders each element's *label* (not its id), so match the SVG text
  // against both the id and the visible label. Multi-line labels produce several
  // <text> elements, so positions are averaged into the element's center.
  const norm = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const keyToId = new Map();
  for (const node of state.graph.nodes) {
    keyToId.set(norm(node.id), node.id);
    if (node.label) keyToId.set(norm(node.label), node.id);
  }

  const acc = new Map();
  for (const textNode of doc.querySelectorAll("text")) {
    const id = keyToId.get(norm(textNode.textContent));
    if (!id) continue;

    let x = Number.parseFloat(textNode.getAttribute("x") || "NaN");
    let y = Number.parseFloat(textNode.getAttribute("y") || "NaN");
    let parent = textNode.parentElement;
    while (parent) {
      const translate = (parent.getAttribute("transform") || "").match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
      if (translate) {
        x += Number.parseFloat(translate[1]);
        y += Number.parseFloat(translate[2]);
      }
      parent = parent.parentElement;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const current = acc.get(id) || { x: 0, y: 0, count: 0 };
    current.x += x;
    current.y += y;
    current.count += 1;
    acc.set(id, current);
  }

  const positions = new Map();
  for (const [id, value] of acc) {
    positions.set(id, { x: value.x / value.count, y: value.y / value.count });
  }
  return positions;
}

// Deterministic left-to-right layered layout used whenever the rendered SVG
// can't pin down every element (e.g. wrapped labels). Sources sit on the left,
// each arrow steps one column to the right, so it mirrors a "left to right"
// PlantUML diagram and never overlaps.
function layeredLayout(graph) {
  const nodes = graph.nodes;
  if (nodes.length === 0) return;

  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const seen = new Set();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to) || edge.from === edge.to) continue;
    // Collapse reciprocal pairs (A->B and B->A) to a single forward edge.
    if (seen.has(`${edge.from}|${edge.to}`) || seen.has(`${edge.to}|${edge.from}`)) continue;
    seen.add(`${edge.from}|${edge.to}`);
    adjacency.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  const layer = new Map(nodes.map((node) => [node.id, 0]));
  const work = new Map(indegree);
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  // Cyclic graphs with no clear source: seed from the highest out-degree node.
  if (queue.length === 0) {
    const root = [...adjacency.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (root) queue.push(root[0]);
  }

  const processed = new Set();
  while (queue.length > 0) {
    const id = queue.shift();
    if (processed.has(id)) continue;
    processed.add(id);
    for (const next of adjacency.get(id) || []) {
      layer.set(next, Math.max(layer.get(next), layer.get(id) + 1));
      work.set(next, work.get(next) - 1);
      if (work.get(next) <= 0 && !processed.has(next)) queue.push(next);
    }
  }

  const byLayer = new Map();
  for (const node of nodes) {
    const value = layer.get(node.id) || 0;
    if (!byLayer.has(value)) byLayer.set(value, []);
    byLayer.get(value).push(node);
  }

  const columnGap = 250;
  const rowGap = 150;
  const marginX = 90;
  const marginY = 70;
  const tallest = Math.max(...[...byLayer.values()].map((group) => group.length));
  for (const [value, group] of byLayer) {
    const offset = (tallest - group.length) / 2;
    group.forEach((node, index) => {
      node.x = marginX + value * columnGap;
      node.y = marginY + (index + offset) * rowGap;
    });
  }
}

async function organizeFromExport() {
  if (state.graph.nodes.length === 0 || state.isOrganizing) return;

  setOrganizing(true);
  appendConsole("Organizing layout...");
  try {
    // Try to mirror PlantUML's own geometry from the rendered SVG. If we can't
    // pin down every element, fall back to the deterministic layered layout so
    // the result is always clean and never overlaps.
    let positions = new Map();
    try {
      const result = await api.preview.render(state.mode, els.codeEditor.value);
      if (result?.ok) {
        setPreviewSvg(result.svg);
        positions = extractExportedNodePositions(result.svg);
      }
      else if (result?.error) {
        appendConsole(`${result.error} — using built-in layout.`);
      }
    }
    catch (error) {
      appendConsole(`Preview unavailable (${error.message}) — using built-in layout.`);
    }

    const previous = snapshotState();
    const matchedEveryNode = positions.size === state.graph.nodes.length && positions.size > 0;

    if (matchedEveryNode) {
      const canvasRect = els.canvasViewport.getBoundingClientRect();
      const values = [...positions.values()];
      const minX = Math.min(...values.map((item) => item.x));
      const maxX = Math.max(...values.map((item) => item.x));
      const minY = Math.min(...values.map((item) => item.y));
      const maxY = Math.max(...values.map((item) => item.y));
      const rangeX = Math.max(maxX - minX, 1);
      const rangeY = Math.max(maxY - minY, 1);
      const margin = 56;
      const usableWidth = Math.max(canvasRect.width - margin * 2 - 220, 320);
      const usableHeight = Math.max(canvasRect.height - margin * 2 - 120, 260);
      for (const node of state.graph.nodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        node.x = margin + ((position.x - minX) / rangeX) * usableWidth;
        node.y = margin + ((position.y - minY) / rangeY) * usableHeight;
      }
    }
    else {
      layeredLayout(state.graph);
    }

    pushUndoSnapshot(previous);
    if (state.builderType === "plantuml-visual") updateEditorFromGraph();

    if (matchedEveryNode) {
      state.canvasZoom = 1;
      state.canvasPan = { x: 0, y: 0 };
      renderBuilder();
    }
    else {
      renderBuilder();
      fitCanvasToDiagram();
    }
    appendConsole(matchedEveryNode ? "Organized from the rendered diagram." : "Organized with the layered layout.");
  }
  finally {
    setOrganizing(false);
  }
}

function autoLayoutGraph() {
  if (state.graph.nodes.length === 0 || state.isOrganizing) return;
  const previous = snapshotState();
  const columns = Math.max(2, Math.ceil(Math.sqrt(state.graph.nodes.length * 1.4)));
  state.graph.nodes.forEach((node, index) => {
    node.x = 80 + (index % columns) * 250;
    node.y = 80 + Math.floor(index / columns) * 170;
  });
  pushUndoSnapshot(previous);
  renderBuilder();
  fitCanvasToDiagram();
  appendConsole("Applied grid auto layout.");
}

function validateDiagram() {
  const issues = [];
  const ids = new Set();
  for (const node of state.graph.nodes) {
    if (ids.has(node.id)) issues.push(`Duplicate node/class id: ${node.id}`);
    ids.add(node.id);
    if (!node.label) issues.push(`Empty label on ${node.id}`);
  }
  for (const edge of state.graph.edges) {
    if (!ids.has(edge.from)) issues.push(`Relationship source is missing: ${edge.from}`);
    if (!ids.has(edge.to)) issues.push(`Relationship target is missing: ${edge.to}`);
    if (state.builderType === "plantuml-class" && !edge.relation) issues.push(`Relationship ${edge.from} -> ${edge.to} has no type.`);
  }
  if (state.mode === "PlantUML" && !/@enduml/i.test(els.codeEditor.value)) {
    issues.push("PlantUML source is missing @enduml.");
  }
  if (state.mode === "Mermaid" && !/^\s*(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/im.test(els.codeEditor.value)) {
    issues.push("Mermaid source does not start with a supported diagram keyword.");
  }

  if (issues.length === 0) {
    setConsole("Validation passed. No structural issues found.");
    showToast("Validation passed — no issues found.", "success");
    schedulePreview(0);
    return;
  }
  setSideView("console");
  setConsole(`Validation found ${issues.length} issue(s):\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  showToast(`Validation found ${issues.length} issue(s) — see Console.`, "error");
}

async function exportCurrentAs() {
  const baseName = (state.activeFile?.name || "diagram").replace(/\.(puml|mmd)$/i, "");
  const result = await api.export.current({
    kind: state.mode,
    content: els.codeEditor.value,
    format: els.exportFormat.value,
    background: els.exportBackground.value,
    baseName,
    source: state.activeFile || null
  });

  if (result?.canceled) return;
  if (!result?.ok) {
    setSideView("console");
    setConsole(result?.error || "Export failed.");
    showToast(result?.error || "Export failed.", "error");
    return;
  }
  appendConsole(`Exported current diagram: ${result.path}`);
  showToast(`Exported to ${result.path}`, "success");
}

// Minimalist UML connector icons, shared by the popover and the context menu so
// relation types read at a glance instead of as "--", "<|--" text.
const REL_ICONS = {
  "--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="37" y2="8"/></svg>',
  "-->": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="34" y2="8"/><polyline points="27,3 36,8 27,13" fill="none"/></svg>',
  "<|--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="26" y2="8"/><polygon points="26,3 37,8 26,13" fill="none"/></svg>',
  "*--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="15" y1="8" x2="37" y2="8"/><polygon points="3,8 9,4 15,8 9,12" fill="currentColor"/></svg>',
  "o--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="15" y1="8" x2="37" y2="8"/><polygon points="3,8 9,4 15,8 9,12" fill="none"/></svg>',
  "..>": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="34" y2="8" stroke-dasharray="4 3"/><polyline points="27,3 36,8 27,13" fill="none"/></svg>'
};

const ICON_TRASH = '<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

// Rewrite the title of a source-mapped element (actor, database, rectangle, use
// case, ...) directly in the PlantUML/Mermaid source, then reparse so the canvas
// and preview update. Source-mapped nodes aren't round-tripped through the graph,
// so the edit has to happen on the text itself.
function replaceNodeLabelInSource(source, node, newLabel) {
  const keywords = Object.keys(PLANTUML_SHAPE_BY_KEYWORD).join("|");
  const declHead = new RegExp(`^(\\s*)(${keywords})\\b(.*)$`, "i");
  const lines = source.split(/\r?\n/);
  const quoted = `"${newLabel.replace(/"/g, "'")}"`;

  for (let i = 0; i < lines.length; i += 1) {
    const decl = lines[i].match(declHead);
    if (!decl) continue;
    const [, indent, keyword, rest] = decl;

    const aliasMatch = rest.match(/\bas\s+([A-Za-z_]\w*)\s*$/i);
    let matchesNode;
    if (aliasMatch) {
      matchesNode = aliasMatch[1] === node.id;
    }
    else {
      const nameMatch = rest.match(/^\s*(?:"([^"]*)"|([A-Za-z_]\w*))/);
      matchesNode = sanitizeId((nameMatch && (nameMatch[1] || nameMatch[2])) || "") === node.id;
    }
    if (!matchesNode) continue;

    if (aliasMatch) {
      // Preserve the alias so existing relationships keep resolving.
      lines[i] = `${indent}${keyword} ${quoted} as ${node.id}`;
    }
    else if (/^\s*"[^"]*"/.test(rest)) {
      // Anonymous, already quoted — just swap the label text.
      lines[i] = lines[i].replace(/"[^"]*"/, quoted);
    }
    else {
      // Bare "keyword Name" — promote to a quoted label with a stable alias.
      lines[i] = `${indent}${keyword} ${quoted} as ${node.id}`;
    }
    return lines.join("\n");
  }
  return null;
}

// Lightweight text-input modal (Electron has no window.prompt). Resolves with the
// entered string, or null if the user cancels.
let activePromptResolve = null;

function openPrompt(message, defaultValue = "") {
  return new Promise((resolve) => {
    activePromptResolve = resolve;
    els.promptLabel.textContent = message;
    els.promptInput.value = defaultValue;
    els.promptModal.classList.remove("hidden");
    els.promptInput.focus();
    els.promptInput.select();
  });
}

function resolvePrompt(value) {
  if (!activePromptResolve) return;
  els.promptModal.classList.add("hidden");
  const resolve = activePromptResolve;
  activePromptResolve = null;
  resolve(value);
}

async function renameNode(node) {
  if (!node) return;
  const current = node.label || node.id;
  const next = await openPrompt("Rename element", current);
  if (next === null) return;
  const clean = next.trim();
  if (!clean || clean === current) return;

  // Visual diagrams regenerate their source from the graph, so update the node
  // directly. Read-only source maps are renamed by rewriting the source text.
  if (state.builderType === "plantuml-visual") {
    const target = state.graph.nodes.find((item) => item.id === node.id);
    if (!target) return;
    target.label = clean;
    updateEditorFromGraph();
    renderBuilder();
    showToast(`Renamed to ${clean}`, "success");
    return;
  }

  const updated = replaceNodeLabelInSource(els.codeEditor.value, node, clean);
  if (!updated) {
    showToast("Couldn't find this element in the source to rename.", "error");
    return;
  }
  els.codeEditor.value = updated;
  setDirty(true);
  updateBuilderFromEditor();
  scheduleDraftSave();
  schedulePreview(150);
  showToast(`Renamed to ${clean}`, "success");
}

function showContextMenu(x, y, kind) {
  const items = [];
  if (kind === "node" && (state.builderType === "source-map" || state.builderType === "plantuml-visual")) {
    const node = state.graph.nodes.find((item) => item.id === state.selectedNodeId);
    items.push(["Rename", () => renameNode(node)]);
    if (state.builderType === "plantuml-visual") {
      items.push(["Connect From Here", () => els.connectNodes.click()]);
      items.push(["Delete", deleteSelection, ICON_TRASH]);
    }
  }
  else if (kind === "node") {
    items.push(["Edit Properties", () => setSideView("properties")]);
    items.push(["Duplicate", duplicateSelection]);
    items.push(["Start Relationship", () => els.connectNodes.click()]);
