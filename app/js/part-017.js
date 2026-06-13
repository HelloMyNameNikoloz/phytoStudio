els.newDiagramFromFiles?.addEventListener("click", createNewFile);
els.saveFile.addEventListener("click", saveActiveFile);
els.refreshFiles.addEventListener("click", loadFiles);
els.refreshPreview.addEventListener("click", () => schedulePreview(0));
els.exportCurrentAs.addEventListener("click", exportCurrentAs);
els.exportCurrent?.addEventListener("click", exportCurrentAs);
els.exportAs?.addEventListener("click", () => runTool("Exporting all diagrams", api.tools.renderAll));
els.organizeDiagram.addEventListener("click", () => organizeFromExport());
els.applyNodeProperties.addEventListener("click", applyNodeProperties);
els.applyEdgeProperties.addEventListener("click", applyEdgeProperties);

// Live inspector bindings.
els.propNodeName.addEventListener("change", applyNodeProperties);
for (const field of [els.propNodeAttributes, els.propNodeMethods]) {
  field.addEventListener("input", liveUpdateNodeBodyFromProperties);
  field.addEventListener("blur", commitNodeBodyEdits);
}
els.propEdgeRelation.addEventListener("change", liveUpdateEdgeFromProperties);
for (const field of [els.propEdgeFromMultiplicity, els.propEdgeToMultiplicity, els.propEdgeLabel]) {
  field.addEventListener("input", liveUpdateEdgeFromProperties);
}

els.relationshipPopover.addEventListener("click", (event) => event.stopPropagation());
els.relationButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-relation]");
  if (!button) return;
  const edge = getSelectedEdge();
  if (!edge) return;
  const previous = snapshotState();
  edge.relation = button.dataset.relation;
  pushUndoSnapshot(previous);
  updateEditorFromGraph();
  renderBuilder();
  syncRelationshipPopover();
  autoOrganizeAfterMutation();
});
for (const input of [els.popoverFromMultiplicity, els.popoverToMultiplicity, els.popoverLabel]) {
  input.addEventListener("input", liveUpdateRelationshipFromPopover);
}
els.popoverDeleteRelationship.addEventListener("click", () => {
  deleteSelection();
  hideRelationshipPopover();
});
els.popoverCloseRelationship.addEventListener("click", () => {
  updateSelectedRelationshipFromPopover();
  autoOrganizeAfterMutation();
  hideRelationshipPopover();
});
els.zoomOutPreview.addEventListener("click", () => {
  state.previewZoom = Math.max(0.25, state.previewZoom - 0.1);
  applyPreviewZoom();
});
els.zoomResetPreview.addEventListener("click", () => {
  fitPreviewToViewport();
});
els.zoomInPreview.addEventListener("click", () => {
  state.previewZoom = Math.min(2.5, state.previewZoom + 0.1);
  applyPreviewZoom();
});

els.addNode.addEventListener("click", () => {
  const previous = snapshotState();
  const position = nextVisibleNodePosition();
  if (state.builderType === "plantuml-class") {
    const id = uniqueNodeId("NewClass");
    state.graph.nodes.push({
      id,
      label: id,
      attributes: [],
      methods: [],
      x: position.x,
      y: position.y
    });
    selectNode(id);
  }
  else {
    const id = uniqueNodeId("NewNode");
    state.graph.nodes.push({
      id,
      label: "",
      x: position.x,
      y: position.y
    });
    selectNode(id);
  }
  pushUndoSnapshot(previous);
  updateEditorFromGraph();
  renderBuilder();
  autoOrganizeAfterMutation();
});

els.connectNodes.addEventListener("click", () => {
  if (!state.selectedNodeId) {
    appendConsole("Select a source node first.");
    return;
  }
  state.pendingConnectionId = state.selectedNodeId;
  appendConsole(`Select a target ${state.builderType === "plantuml-class" ? "class" : "node"} to connect from ${state.pendingConnectionId}.`);
  renderBuilder();
});

els.deleteNode.addEventListener("click", () => {
  deleteSelection();
});

els.clearConsole.addEventListener("click", () => {
  setConsole("Ready.");
  clearConsoleBadge();
});
els.checkTools?.addEventListener("click", () => runTool("Checking local tools", api.tools.check));
els.renderPlantUml?.addEventListener("click", () => runTool("Rendering PlantUML diagrams", api.tools.renderPlantUml));
els.renderMermaid?.addEventListener("click", () => runTool("Rendering Mermaid diagrams", api.tools.renderMermaid));
els.renderAll?.addEventListener("click", () => runTool("Rendering all diagrams", api.tools.renderAll));
els.openOutput?.addEventListener("click", api.tools.openOutput);

els.fitCanvas.addEventListener("click", fitCanvasToDiagram);
els.zoomOutCanvas.addEventListener("click", () => setCanvasZoom(state.canvasZoom - 0.1));
els.zoomResetCanvas.addEventListener("click", resetCanvasZoom);
els.zoomInCanvas.addEventListener("click", () => setCanvasZoom(state.canvasZoom + 0.1));

els.edgeLayer.addEventListener("click", (event) => {
  const hit = event.target.closest?.(".edge-hit");
  if (!hit) return;
  event.stopPropagation();
  const index = Number(hit.dataset.edgeIndex);
  if (!Number.isInteger(index)) return;
  showRelationshipPopover(index, event.clientX, event.clientY);
  renderBuilder();
});

els.edgeLayer.addEventListener("contextmenu", (event) => {
  const hit = event.target.closest?.(".edge-hit");
  if (!hit) return;
  event.preventDefault();
  event.stopPropagation();
  const index = Number(hit.dataset.edgeIndex);
  if (!Number.isInteger(index)) return;
  selectEdge(index);
  showContextMenu(event.clientX, event.clientY, "edge");
  renderBuilder();
});

els.canvasViewport.addEventListener("wheel", (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const rect = els.canvasViewport.getBoundingClientRect();
  setCanvasZoom(state.canvasZoom + (event.deltaY > 0 ? -0.08 : 0.08), {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  });
}, { passive: false });

els.canvasViewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".diagram-node") || event.target.closest(".inline-edit") || event.target.closest(".edge-hit")) return;
  clearSelection();
  els.canvasViewport.classList.add("panning");
  const start = { x: event.clientX, y: event.clientY, panX: state.canvasPan.x, panY: state.canvasPan.y };
  els.canvasViewport.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    state.canvasPan.x = start.panX + moveEvent.clientX - start.x;
    state.canvasPan.y = start.panY + moveEvent.clientY - start.y;
    applyCanvasTransform();
  };
  const onUp = () => {
    els.canvasViewport.classList.remove("panning");
    els.canvasViewport.removeEventListener("pointermove", onMove);
    els.canvasViewport.removeEventListener("pointerup", onUp);
  };

  els.canvasViewport.addEventListener("pointermove", onMove);
  els.canvasViewport.addEventListener("pointerup", onUp);
});

els.canvasViewport.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".diagram-node")) return;
  event.preventDefault();
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  showContextMenu(event.clientX, event.clientY, "canvas");
