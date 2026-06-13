
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

  return {
    meta: {
      title: titleMatch ? titleMatch[1].trim() : "Class Diagram",
      direction: directionMatch ? directionMatch[1].trim() : "left to right direction"
    },
    graph: { nodes: [...nodes.values()], edges }
  };
}

function graphToPlantUml(graph, meta) {
  const lines = [
    "@startuml",
    `title ${meta?.title || "Class Diagram"}`,
    "",
    meta?.direction || "left to right direction",
    ""
  ];

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
