    appendConsole(`Saved ${fileDisplayPath(file)}`);
    showToast(`Saved ${file.name}`, "success");
    return true;
  }
  catch (error) {
    appendConsole(`Save failed: ${error.message}`);
    showToast(`Save failed: ${error.message}`, "error");
    return false;
  }
}

async function createNewFile() {
  if (state.isDirty) {
    const shouldContinue = window.confirm("You have unsaved changes. Continue without saving?");
    if (!shouldContinue) return;
  }

  const content = templates[state.mode];
  const defaultName = state.mode === "PlantUML" ? "new-diagram.puml" : "new-diagram.mmd";

  try {
    const result = await api.workspace.saveFileAs({
      kind: state.mode,
      content,
      defaultName
    });
    if (result?.canceled || !result?.file) return;

    state.activeFile = result.file;
    els.currentFile.textContent = fileDisplayPath(result.file);
    updateExportPanel();
    els.codeEditor.value = content;
    setDirty(false);
    updateSaveStatus(`Saved ${formatTime()}`, "ok");
    rememberRecentFile(result.file);
    persistDraft();
    await loadFiles();
    updateBuilderFromEditor();
    schedulePreview(100);
    renderFileList();
    setSideView("builder");
    showToast(`Created ${result.file.name}`, "success");
  }
  catch (error) {
    appendConsole(`Create failed: ${error.message}`);
    showToast(`Create failed: ${error.message}`, "error");
  }
}

async function runTool(label, runner) {
  setConsole(`${label}...\n`);
  try {
    const result = await runner();
    setConsole(result.output || `${label} finished.`);
    if (result.code !== 0) {
      appendConsole(`\nExit code: ${result.code}`);
      showToast(`${label} failed (exit ${result.code}) — see Console.`, "error");
    }
    else {
      showToast(`${label} finished.`, "success");
    }
  }
  catch (error) {
    setConsole(error.message);
    showToast(`${label} failed: ${error.message}`, "error");
  }
}

function deleteSelection() {
  if (state.selectedEdgeIndex !== null) {
    const previous = snapshotState();
    state.graph.edges.splice(state.selectedEdgeIndex, 1);
    state.selectedEdgeIndex = null;
    pushUndoSnapshot(previous);
    updateEditorFromGraph();
    renderBuilder();
    autoOrganizeAfterMutation();
    return;
  }

  if (!state.selectedNodeId) return;
  const previous = snapshotState();
  state.graph.nodes = state.graph.nodes.filter((node) => node.id !== state.selectedNodeId);
  state.graph.edges = state.graph.edges.filter((edge) => edge.from !== state.selectedNodeId && edge.to !== state.selectedNodeId);
  state.selectedNodeId = null;
  state.pendingConnectionId = null;
  pushUndoSnapshot(previous);
  updateEditorFromGraph();
  renderBuilder();
  autoOrganizeAfterMutation();
}

function duplicateSelection() {
  const selectedNode = getSelectedNode();
  if (!selectedNode) return;

  const previous = snapshotState();
  const id = uniqueNodeId(`${selectedNode.id}Copy`);
  state.graph.nodes.push({
    ...selectedNode,
    id,
    label: id,
    attributes: [...(selectedNode.attributes || [])],
    methods: [...(selectedNode.methods || [])],
    x: selectedNode.x + 36,
    y: selectedNode.y + 36
  });
  selectNode(id);
  pushUndoSnapshot(previous);
  updateEditorFromGraph();
  renderBuilder();
  autoOrganizeAfterMutation();
}

function applyNodeProperties() {
  const selectedNode = getSelectedNode();
  if (!selectedNode || state.builderType !== "plantuml-class") return;

  const nextId = sanitizeId(els.propNodeName.value);
  if (nextId !== selectedNode.id && state.graph.nodes.some((node) => node.id === nextId)) {
    appendConsole(`Class already exists: ${nextId}`);
    return;
  }

  const previous = snapshotState();
  const previousId = selectedNode.id;
  selectedNode.id = nextId;
  selectedNode.label = nextId;
  selectedNode.attributes = els.propNodeAttributes.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  selectedNode.methods = els.propNodeMethods.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const edge of state.graph.edges) {
    if (edge.from === previousId) edge.from = nextId;
    if (edge.to === previousId) edge.to = nextId;
  }

  selectNode(nextId);
  pushUndoSnapshot(previous);
  updateEditorFromGraph();
  renderBuilder();
  autoOrganizeAfterMutation();
}

function applyEdgeProperties() {
  const selectedEdge = getSelectedEdge();
  if (!selectedEdge || state.builderType !== "plantuml-class") return;

  const previous = snapshotState();
  selectedEdge.relation = els.propEdgeRelation.value;
  selectedEdge.fromMultiplicity = els.propEdgeFromMultiplicity.value.trim();
  selectedEdge.toMultiplicity = els.propEdgeToMultiplicity.value.trim();
  selectedEdge.label = els.propEdgeLabel.value.trim();
  pushUndoSnapshot(previous);
  updateEditorFromGraph();
  renderBuilder();
  autoOrganizeAfterMutation();
}

// Live inspector editing: update the model + source as the user types, redrawing
// only what's needed so the caret is never disturbed. The "Apply" buttons remain
// for an explicit commit, but are no longer required.
function liveUpdateEdgeFromProperties() {
  const edge = getSelectedEdge();
  if (!edge || state.builderType !== "plantuml-class") return;
  edge.relation = els.propEdgeRelation.value;
  edge.fromMultiplicity = els.propEdgeFromMultiplicity.value.trim();
  edge.toMultiplicity = els.propEdgeToMultiplicity.value.trim();
  edge.label = els.propEdgeLabel.value.trim();
  updateEditorFromGraph();
  renderEdges();
}

function liveUpdateNodeBodyFromProperties() {
  const node = getSelectedNode();
  if (!node || state.builderType !== "plantuml-class") return;
  node.attributes = els.propNodeAttributes.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  node.methods = els.propNodeMethods.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  updateEditorFromGraph();
}

