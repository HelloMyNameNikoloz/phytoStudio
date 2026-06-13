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
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return new Map();

  const positions = new Map();
  const nodeIds = new Set(state.graph.nodes.map((node) => node.id));
  const textNodes = [...doc.querySelectorAll("text")];

  for (const textNode of textNodes) {
    const label = textNode.textContent.trim();
    if (!nodeIds.has(label) || positions.has(label)) continue;

    let x = Number.parseFloat(textNode.getAttribute("x") || "NaN");
    let y = Number.parseFloat(textNode.getAttribute("y") || "NaN");

    let parent = textNode.parentElement;
    while (parent) {
      const transform = parent.getAttribute("transform") || "";
      const translate = transform.match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
      if (translate) {
        x += Number.parseFloat(translate[1]);
        y += Number.parseFloat(translate[2]);
      }
      parent = parent.parentElement;
    }

    if (Number.isFinite(x) && Number.isFinite(y)) {
      positions.set(label, { x, y });
    }
  }

  return positions;
}

async function organizeFromExport() {
  if (state.graph.nodes.length === 0 || state.isOrganizing) return;

  setOrganizing(true);
  appendConsole("Organizing layout...");
  try {
    const result = await api.preview.render(state.mode, els.codeEditor.value);
    if (!result.ok) {
      setPreviewStatus(result.error || "Preview failed.", true);
      appendConsole(result.error || "Preview failed.");
      return;
    }

    setPreviewSvg(result.svg);
    const positions = extractExportedNodePositions(result.svg);
    if (positions.size === 0) {
      appendConsole("Could not read class positions from exported SVG.");
      return;
    }

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
    const previous = snapshotState();

    for (const node of state.graph.nodes) {
      const position = positions.get(node.id);
      if (!position) continue;
      node.x = margin + ((position.x - minX) / rangeX) * usableWidth;
      node.y = margin + ((position.y - minY) / rangeY) * usableHeight;
    }

    state.canvasZoom = 1;
    state.canvasPan = { x: 0, y: 0 };
    pushUndoSnapshot(previous);
    renderBuilder();
    appendConsole("Organized builder from exported SVG layout.");
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
    baseName
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

function showContextMenu(x, y, kind) {
  const items = [];
  if (kind === "node") {
    items.push(["Edit Properties", () => setSideView("properties")]);
    items.push(["Duplicate", duplicateSelection]);
    items.push(["Start Relationship", () => els.connectNodes.click()]);
