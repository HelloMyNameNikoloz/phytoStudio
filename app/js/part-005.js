  });
}

function pushUndoSnapshot(snapshot) {
  if (!snapshot || snapshotSignature(snapshot) === snapshotSignature(snapshotState())) return;
  state.history.undo.push(snapshot);
  if (state.history.undo.length > state.history.limit) {
    state.history.undo.shift();
  }
  state.history.redo = [];
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  state.mode = snapshot.mode;
  state.builderType = snapshot.builderType;
  state.graph = cloneValue(snapshot.graph);
  state.plantUmlMeta = cloneValue(snapshot.plantUmlMeta);
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  state.pendingConnectionId = null;
  state.inlineEdit = null;
  els.codeEditor.value = snapshot.source;
  els.modeMermaid.classList.toggle("active", state.mode === "Mermaid");
  els.modePlantUml.classList.toggle("active", state.mode === "PlantUML");
  els.builderHint.textContent = state.mode === "Mermaid"
    ? "Flowchart canvas syncs with Mermaid code."
    : "PlantUML is edited as source and rendered locally.";
  setDirty(true);
  renderBuilder();
  schedulePreview(250);
}

function undoVisualChange() {
  const previous = state.history.undo.pop();
  if (!previous) return;
  state.history.redo.push(snapshotState());
  restoreSnapshot(previous);
}

function redoVisualChange() {
  const next = state.history.redo.pop();
  if (!next) return;
  state.history.undo.push(snapshotState());
  restoreSnapshot(next);
}

function getSelectedNode() {
  return state.graph.nodes.find((node) => node.id === state.selectedNodeId) || null;
}

function getSelectedEdge() {
  if (state.selectedEdgeIndex === null) return null;
  return state.graph.edges[state.selectedEdgeIndex] || null;
}

function showProperties() {
  const selectedNode = getSelectedNode();
  const selectedEdge = getSelectedEdge();
  const canEditNode = Boolean(selectedNode && state.builderType === "plantuml-class");
  const canEditEdge = Boolean(selectedEdge && state.builderType === "plantuml-class");

  els.propertiesEmpty.classList.toggle("hidden", canEditNode || canEditEdge);
  els.nodeProperties.classList.toggle("hidden", !canEditNode);
  els.edgeProperties.classList.toggle("hidden", !canEditEdge);

  if (selectedNode && state.builderType === "plantuml-class") {
    els.propNodeName.value = selectedNode.label;
    els.propNodeAttributes.value = (selectedNode.attributes || []).join("\n");
    els.propNodeMethods.value = (selectedNode.methods || []).join("\n");
  }

  if (selectedEdge && state.builderType === "plantuml-class") {
    els.propEdgeRelation.value = selectedEdge.relation || "--";
    els.propEdgeFromMultiplicity.value = selectedEdge.fromMultiplicity || "";
    els.propEdgeToMultiplicity.value = selectedEdge.toMultiplicity || "";
    els.propEdgeLabel.value = selectedEdge.label || "";
  }
}

function selectNode(id) {
  state.selectedNodeId = id;
  state.selectedEdgeIndex = null;
  hideRelationshipPopover();
  showProperties();
}

function selectEdge(index) {
  state.selectedEdgeIndex = index;
  state.selectedNodeId = null;
  state.pendingConnectionId = null;
  showProperties();
}

function shouldAutoOrganize() {
  return state.builderType === "plantuml-class" && state.graph.nodes.length > 0;
}

function autoOrganizeAfterMutation() {
  if (!shouldAutoOrganize()) {
    renderBuilder();
    return;
  }
  window.setTimeout(() => {
    organizeFromExport().catch((error) => appendConsole(error.message));
  }, 120);
}

function hideRelationshipPopover() {
  els.relationshipPopover.classList.add("hidden");
}

function positionRelationshipPopover(x, y) {
  const margin = 12;
  els.relationshipPopover.style.left = `${x + margin}px`;
  els.relationshipPopover.style.top = `${y + margin}px`;
  requestAnimationFrame(() => {
    const rect = els.relationshipPopover.getBoundingClientRect();
    const left = Math.min(Math.max(margin, x + margin), Math.max(margin, window.innerWidth - rect.width - margin));
    const top = Math.min(Math.max(margin, y + margin), Math.max(margin, window.innerHeight - rect.height - margin));
    els.relationshipPopover.style.left = `${left}px`;
    els.relationshipPopover.style.top = `${top}px`;
  });
}

function syncRelationshipPopover() {
  const edge = getSelectedEdge();
  if (!edge) {
    hideRelationshipPopover();
    return;
  }
  els.relationButtons.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.relation === (edge.relation || "--"));
  });
  els.popoverFromMultiplicity.value = edge.fromMultiplicity || "";
  els.popoverToMultiplicity.value = edge.toMultiplicity || "";
  els.popoverLabel.value = edge.label || "";
}

function showRelationshipPopover(index, clientX, clientY) {
  selectEdge(index);
  syncRelationshipPopover();
  positionRelationshipPopover(clientX, clientY);
  els.relationshipPopover.classList.remove("hidden");
  state.suppressNextDocumentClick = true;
}

function updateSelectedRelationshipFromPopover() {
  const edge = getSelectedEdge();
  if (!edge || state.builderType !== "plantuml-class") return;
  edge.fromMultiplicity = els.popoverFromMultiplicity.value.trim();
  edge.toMultiplicity = els.popoverToMultiplicity.value.trim();
  edge.label = els.popoverLabel.value.trim();
  updateEditorFromGraph();
  renderBuilder();
  syncRelationshipPopover();
}

// Live update while the user is typing in the popover. Crucially this does NOT
// rebuild nodes or write the value back into the input (which would reset the
// caret) — it just keeps the edge, source code, and rendered line in sync so a
// value like "0..*" can be typed without fighting the cursor.
function liveUpdateRelationshipFromPopover() {
  const edge = getSelectedEdge();
  if (!edge || state.builderType !== "plantuml-class") return;
  edge.fromMultiplicity = els.popoverFromMultiplicity.value.trim();
  edge.toMultiplicity = els.popoverToMultiplicity.value.trim();
  edge.label = els.popoverLabel.value.trim();
  updateEditorFromGraph();
  renderEdges();
}

function nextVisibleNodePosition() {
  const viewport = els.canvasViewport.getBoundingClientRect();
  return {
    x: Math.max(24, (viewport.width / 2 - state.canvasPan.x) / state.canvasZoom - 90),
    y: Math.max(24, (viewport.height / 2 - state.canvasPan.y) / state.canvasZoom - 60)
  };
}

