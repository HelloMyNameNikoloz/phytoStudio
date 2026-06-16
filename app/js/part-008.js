
    const from = edgeMatch[1];
    const fromMultiplicity = edgeMatch[2] || "";
    const relation = edgeMatch[3];
    const toMultiplicity = edgeMatch[4] || "";
    const to = edgeMatch[5];
    const label = edgeMatch[6] || "";

    if (!nodes.has(from)) {
      nodes.set(from, { id: from, label: from, attributes: [], methods: [], x: 70, y: 60 });
    }
    if (!nodes.has(to)) {
      nodes.set(to, { id: to, label: to, attributes: [], methods: [], x: 290, y: 60 });
    }

    edges.push({ from, to, relation, label, fromMultiplicity, toMultiplicity });
  }

  const renderOptions = readRenderOptionsFromSource(source);
  return {
    meta: {
      title: titleMatch ? titleMatch[1].trim() : "Class Diagram",
      orientation: renderOptions.orientation,
      lineType: renderOptions.lineType,
      classCircle: renderOptions.classCircle,
      attrIcons: renderOptions.attrIcons
    },
    graph: { nodes: [...nodes.values()], edges }
  };
}

function graphToPlantUml(graph, meta) {
  const lines = ["@startuml", `title ${meta?.title || "Class Diagram"}`, ""];
  lines.push((meta?.orientation || "tb") === "lr" ? "left to right direction" : "top to bottom direction");
  if (meta?.lineType && meta.lineType !== "default") lines.push(`skinparam linetype ${meta.lineType}`);
  if (meta && meta.classCircle === false) lines.push("hide circle");
  if (meta && meta.attrIcons === false) lines.push("skinparam classAttributeIconSize 0");
  lines.push("");

  for (const node of graph.nodes) {
    lines.push(`class ${node.id} {`);
    for (const attribute of node.attributes || []) {
      lines.push(`  ${attribute}`);
    }
    if ((node.attributes || []).length > 0 && (node.methods || []).length > 0) {
      lines.push("");
    }
    for (const method of node.methods || []) {
      lines.push(`  ${method}`);
    }
    lines.push("}");
    lines.push("");
  }

  for (const edge of graph.edges) {
    const leftMultiplicity = edge.fromMultiplicity ? ` "${edge.fromMultiplicity}"` : "";
    const rightMultiplicity = edge.toMultiplicity ? ` "${edge.toMultiplicity}"` : "";
    const label = edge.label ? ` : ${edge.label}` : "";
    lines.push(`${edge.from}${leftMultiplicity} ${edge.relation || "-->"}${rightMultiplicity} ${edge.to}${label}`);
  }

  lines.push("");
  lines.push("@enduml");
  return `${lines.join("\n")}\n`;
}

function updateEditorFromGraph() {
  if (state.builderType === "plantuml-class") {
    els.codeEditor.value = graphToPlantUml(state.graph, state.plantUmlMeta);
  }
  else if (state.builderType === "plantuml-visual") {
    els.codeEditor.value = graphToPlantUmlVisual(state.graph, state.plantUmlMeta);
  }
  else if (state.builderType === "mermaid-flowchart") {
    els.codeEditor.value = graphToMermaid(state.graph);
  }
  else {
    return;
  }
  setDirty(true);
  scheduleDraftSave();
  schedulePreview(300);
}

// ---- PlantUML render options (layout / line style / class & member icons) ----
// These options live inside the diagram source so they sync in both directions:
// the toolbar writes the directives into the code, and editing the code (or the
// class builder round-trip) reflects back onto the toolbar. Every render path
// (preview, organize, export, thumbnails) reads the source, so all stay in sync.

function readRenderOptionsFromSource(source) {
  const orientation = /^\s*left to right direction\s*$/im.test(source) ? "lr" : "tb";
  let lineType = "default";
  const lt = source.match(/^\s*skinparam\s+linetype\s+(\w+)\s*$/im);
  if (lt) lineType = lt[1].toLowerCase();
  return {
    orientation,
    lineType,
    classCircle: !/^\s*hide\s+circle\s*$/im.test(source),
    attrIcons: !/^\s*skinparam\s+classattributeiconsize\s+0\s*$/im.test(source)
  };
}

function applyRenderOptionsToSource(source, opts) {
  if (!/^\s*@startuml\b/im.test(source)) return source;
  const isClass = /^\s*(abstract\s+)?class\s+[A-Za-z_]/im.test(source);

  const cleaned = source.split(/\r?\n/).filter((line) => {
    const t = line.trim().toLowerCase();
    if (t === "left to right direction" || t === "top to bottom direction") return false;
    if (/^skinparam\s+linetype\b/.test(t)) return false;
    if (t === "hide circle") return false;
    if (/^skinparam\s+classattributeiconsize\b/.test(t)) return false;
    return true;
  });

  const directives = [];
  directives.push(opts.orientation === "lr" ? "left to right direction" : "top to bottom direction");
  if (opts.lineType && opts.lineType !== "default") directives.push(`skinparam linetype ${opts.lineType}`);
  if (isClass && opts.classCircle === false) directives.push("hide circle");
  if (isClass && opts.attrIcons === false) directives.push("skinparam classAttributeIconSize 0");

  let insertAt = cleaned.findIndex((line) => /^\s*@startuml\b/i.test(line)) + 1;
  if (/^\s*title\b/i.test(cleaned[insertAt] || "")) insertAt += 1;
  cleaned.splice(insertAt, 0, ...directives);
  return cleaned.join("\n");
}

function reflectRenderOptionControls() {
  if (!els.optOrientation) return;
  els.optOrientation.value = state.renderOptions.orientation;
  els.optLineType.value = state.renderOptions.lineType;
  els.optClassCircle.classList.toggle("active", state.renderOptions.classCircle);
  els.optClassCircle.setAttribute("aria-pressed", String(state.renderOptions.classCircle));
  els.optAttrIcons.classList.toggle("active", state.renderOptions.attrIcons);
  els.optAttrIcons.setAttribute("aria-pressed", String(state.renderOptions.attrIcons));
}

function updateRenderOptionsAvailability() {
  if (!els.renderOptions) return;
  const isPuml = state.mode === "PlantUML" && /^\s*@startuml\b/im.test(els.codeEditor.value);
  const isClass = isPuml && /^\s*(abstract\s+)?class\s+[A-Za-z_]/im.test(els.codeEditor.value);
  els.renderOptions.hidden = !isPuml;
  els.optClassCircle.disabled = !isClass;
  els.optAttrIcons.disabled = !isClass;
  els.optClassCircle.classList.toggle("control-disabled", !isClass);
  els.optAttrIcons.classList.toggle("control-disabled", !isClass);
}

function syncRenderOptionsFromSource() {
  if (state.mode === "PlantUML" && /^\s*@startuml\b/im.test(els.codeEditor.value)) {
    state.renderOptions = readRenderOptionsFromSource(els.codeEditor.value);
  }
  reflectRenderOptionControls();
  updateRenderOptionsAvailability();
}

function setRenderOption(key, value) {
  state.renderOptions[key] = value;
  reflectRenderOptionControls();
  if (state.mode !== "PlantUML") return;

  if (state.builderType === "plantuml-class" || state.builderType === "plantuml-visual") {
    state.plantUmlMeta = state.plantUmlMeta || {};
    state.plantUmlMeta.orientation = state.renderOptions.orientation;
    state.plantUmlMeta.lineType = state.renderOptions.lineType;
    state.plantUmlMeta.classCircle = state.renderOptions.classCircle;
    state.plantUmlMeta.attrIcons = state.renderOptions.attrIcons;
    updateEditorFromGraph();
  }
  else {
    const next = applyRenderOptionsToSource(els.codeEditor.value, state.renderOptions);
    if (next !== els.codeEditor.value) {
      els.codeEditor.value = next;
      setDirty(true);
      scheduleDraftSave();
    }
  }
  updateRenderOptionsAvailability();
  schedulePreview(0);
  if (state.activeFile) state.thumbnailCache.delete(fileKey(state.activeFile));
  renderFileList();
}

function getConnectionPoint(rect, target) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const dx = target.x - centerX;
  const dy = target.y - centerY;
  if (dx === 0 && dy === 0) {
    return { x: centerX, y: centerY };
  }

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : (rect.width / 2) / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : (rect.height / 2) / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return {
    x: centerX + dx * scale,
    y: centerY + dy * scale
  };
}

function appendEdgeText(textValue, x, y, className = "edge-label") {
  if (!textValue) return;
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y);
  text.setAttribute("text-anchor", "middle");
  text.classList.add(className);
  text.textContent = textValue;
  els.edgeLayer.appendChild(text);
}

function renderEdges() {
  els.edgeLayer.setAttribute("viewBox", `0 0 ${state.canvasWorld.width} ${state.canvasWorld.height}`);
  els.edgeLayer.setAttribute("width", state.canvasWorld.width);
  els.edgeLayer.setAttribute("height", state.canvasWorld.height);
  els.edgeLayer.innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" style="fill: var(--edge-color)"></path>
      </marker>
      <marker id="arrowSelected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" style="fill: var(--edge-selected-color)"></path>
      </marker>
      <marker id="inheritance" viewBox="0 0 12 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 10 5 L 1 1 L 1 9 Z" style="fill: var(--edge-marker-open-fill); stroke: var(--edge-color)" stroke-width="1.4"></path>
      </marker>
      <marker id="inheritanceSelected" viewBox="0 0 12 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 10 5 L 1 1 L 1 9 Z" style="fill: var(--edge-marker-open-fill); stroke: var(--edge-selected-color)" stroke-width="1.4"></path>
      </marker>
      <marker id="diamond" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 2 6 L 6 2 L 10 6 L 6 10 Z" style="fill: var(--edge-color)"></path>
      </marker>
      <marker id="diamondSelected" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 2 6 L 6 2 L 10 6 L 6 10 Z" style="fill: var(--edge-selected-color)"></path>
      </marker>
      <marker id="openDiamond" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 2 6 L 6 2 L 10 6 L 6 10 Z" style="fill: var(--edge-marker-open-fill); stroke: var(--edge-color)" stroke-width="1.4"></path>
      </marker>
      <marker id="openDiamondSelected" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 2 6 L 6 2 L 10 6 L 6 10 Z" style="fill: var(--edge-marker-open-fill); stroke: var(--edge-selected-color)" stroke-width="1.4"></path>
      </marker>
    </defs>
  `;

  const nodes = new Map([...els.canvas.querySelectorAll(".diagram-node")].map((nodeEl) => {
    const id = nodeEl.dataset.id;
    const node = state.graph.nodes.find((item) => item.id === id);
    return [nodeEl.dataset.id, {
      x: node?.x || 0,
      y: node?.y || 0,
      width: nodeEl.offsetWidth,
      height: nodeEl.offsetHeight
    }];
  }));

  state.graph.edges.forEach((edge, index) => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) return;

    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    const fromPoint = getConnectionPoint(from, toCenter);
    const toPoint = getConnectionPoint(to, fromCenter);
    const dx = toPoint.x - fromPoint.x;
    const dy = toPoint.y - fromPoint.y;
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const offsetX = (dy / distance) * 8;
    const offsetY = (-dx / distance) * 8;
    const x1 = fromPoint.x;
    const y1 = fromPoint.y;
    const x2 = toPoint.x;
    const y2 = toPoint.y;
    const relation = edge.relation || "-->";
    const isSelected = state.selectedEdgeIndex === index;
    const markerEnd = relation.includes(">") ? `url(#${isSelected ? "arrowSelected" : "arrow"})` : "";
    const markerStart = relation.startsWith("<|") ? `url(#${isSelected ? "inheritanceSelected" : "inheritance"})` : relation.startsWith("*") ? `url(#${isSelected ? "diamondSelected" : "diamond"})` : relation.startsWith("o") ? `url(#${isSelected ? "openDiamondSelected" : "openDiamond"})` : "";

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", x1);
    hit.setAttribute("y1", y1);
    hit.setAttribute("x2", x2);
    hit.setAttribute("y2", y2);
    hit.setAttribute("stroke", "transparent");
