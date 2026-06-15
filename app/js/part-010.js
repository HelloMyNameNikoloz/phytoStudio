    if (state.builderType !== "mermaid-flowchart") {
      nodeEl.querySelector(".node-label").textContent = node.label;
    }
  }
  nodeEl.style.left = `${node.x}px`;
  nodeEl.style.top = `${node.y}px`;
  nodeEl.classList.toggle("selected", state.selectedNodeId === node.id);
  nodeEl.classList.toggle("pending", state.pendingConnectionId === node.id);
  if (state.builderType === "plantuml-class" || state.builderType === "mermaid-flowchart") {
    wireInlineEditors(nodeEl, node);
  }

  nodeEl.addEventListener("click", (event) => {
    let createdEdge = false;
    if (state.pendingConnectionId && state.pendingConnectionId !== node.id) {
      const exists = state.graph.edges.some((edge) => edge.from === state.pendingConnectionId && edge.to === node.id);
      if (!exists) {
        const previous = snapshotState();
        if (state.builderType === "plantuml-class") {
          state.graph.edges.push({
            from: state.pendingConnectionId,
            to: node.id,
            relation: "-->",
            label: "",
            fromMultiplicity: "",
            toMultiplicity: ""
          });
        }
        else {
          state.graph.edges.push({ from: state.pendingConnectionId, to: node.id });
        }
        pushUndoSnapshot(previous);
        updateEditorFromGraph();
        state.selectedEdgeIndex = state.graph.edges.length - 1;
        state.selectedNodeId = null;
        createdEdge = true;
        autoOrganizeAfterMutation();
      }
      state.pendingConnectionId = null;
    }
    if (!createdEdge) {
      selectNode(node.id);
    }
    renderBuilder();
    if (createdEdge) {
      showRelationshipPopover(state.selectedEdgeIndex, event.clientX, event.clientY);
    }
  });

  nodeEl.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectNode(node.id);
    showContextMenu(event.clientX, event.clientY, "node");
    renderBuilder();
  });

  nodeEl.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".inline-edit")) return;
    event.stopPropagation();
    state.isDragging = true;
    selectNode(node.id);
    // Reflect the selection immediately on press so the node highlights pink
    // without waiting for the click-release render, and clear any selected edge.
    els.canvas.querySelectorAll(".diagram-node.selected").forEach((el) => el.classList.remove("selected"));
    nodeEl.classList.add("selected");
    renderEdges();
    nodeEl.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = node.x;
    const initialY = node.y;

    const onPointerMove = (moveEvent) => {
      const nextX = Math.max(12, initialX + (moveEvent.clientX - startX) / state.canvasZoom);
      const nextY = Math.max(12, initialY + (moveEvent.clientY - startY) / state.canvasZoom);
      node.x = nextX;
      node.y = nextY;
      nodeEl.style.left = `${nextX}px`;
      nodeEl.style.top = `${nextY}px`;
      renderEdges();
    };

    const onPointerUp = () => {
      state.isDragging = false;
      nodeEl.removeEventListener("pointermove", onPointerMove);
      nodeEl.removeEventListener("pointerup", onPointerUp);
      renderMinimap();
    };

    nodeEl.addEventListener("pointermove", onPointerMove);
    nodeEl.addEventListener("pointerup", onPointerUp);
  });

  return nodeEl;
}

function renderBuilder() {
  els.canvas.innerHTML = "";
  if (state.selectedNodeId && !state.graph.nodes.some((node) => node.id === state.selectedNodeId)) {
    state.selectedNodeId = null;
  }
  if (state.selectedEdgeIndex !== null && !state.graph.edges[state.selectedEdgeIndex]) {
    state.selectedEdgeIndex = null;
  }
  const isPreview = state.builderType === "preview";
  const enabled = state.builderType !== "none" && !isPreview && state.graph.nodes.length > 0;
  const canEditStructure = state.builderType === "plantuml-class" || state.builderType === "mermaid-flowchart";

  if (state.builderType === "plantuml-class") {
    setCommandButton(els.addNode, "+", "Add Class");
    setCommandButton(els.connectNodes, "⟶", "Associate");
    if (els.deleteNode) els.deleteNode.textContent = "Delete";
  }
  else {
    setCommandButton(els.addNode, "+", "Add Node");
    setCommandButton(els.connectNodes, "⟶", "Connect");
    if (els.deleteNode) els.deleteNode.textContent = "Delete";
  }

  els.emptyBuilder.classList.toggle("hidden", enabled || isPreview);
  if (els.builderPreview) els.builderPreview.classList.toggle("hidden", !isPreview);
  els.addNode.disabled = state.isOrganizing || !enabled || !canEditStructure;
  els.connectNodes.disabled = state.isOrganizing || !enabled || !canEditStructure;
  if (els.deleteNode) els.deleteNode.disabled = state.isOrganizing || !enabled || !canEditStructure;

  if (isPreview) {
    els.edgeLayer.innerHTML = "";
    els.canvas.innerHTML = "";
    showProperties();
    renderMinimap();
    return;
  }

  if (!enabled) {
    els.edgeLayer.innerHTML = "";
    showProperties();
    renderMinimap();
    return;
  }

  for (const node of state.graph.nodes) {
    els.canvas.appendChild(makeNodeElement(node));
  }

  requestAnimationFrame(() => {
    renderEdges();
    applyCanvasTransform();
  });
  showProperties();
}

function updateBuilderFromEditor() {
  syncRenderOptionsFromSource();
  if (state.mode === "Mermaid" && isFlowchartSource(els.codeEditor.value)) {
    state.builderType = "mermaid-flowchart";
    const previousPositions = new Map(state.graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const nextGraph = parseMermaidFlowchart(els.codeEditor.value);
    for (const node of nextGraph.nodes) {
      const previous = previousPositions.get(node.id);
      if (previous) {
        node.x = previous.x;
        node.y = previous.y;
      }
    }
    state.graph = nextGraph;
    els.emptyBuilder.textContent = "Open or create a Mermaid flowchart to edit nodes directly.";
    renderBuilder();
    return;
  }

  if (state.mode === "PlantUML" && isPlantUmlClassSource(els.codeEditor.value)) {
    state.builderType = "plantuml-class";
    const previousPositions = new Map(state.graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const parsed = parsePlantUmlClassDiagram(els.codeEditor.value);
    state.plantUmlMeta = parsed.meta;
    for (const node of parsed.graph.nodes) {
      const previous = previousPositions.get(node.id);
      if (previous) {
        node.x = previous.x;
        node.y = previous.y;
      }
    }
    state.graph = parsed.graph;
    els.emptyBuilder.textContent = "Open a PlantUML class diagram to edit classes and relationships visually.";
    renderBuilder();
    return;
  }

  if (
    (state.mode === "PlantUML" && (isPlantUmlSequenceSource(els.codeEditor.value) || isPlantUmlUseCaseSource(els.codeEditor.value))) ||
