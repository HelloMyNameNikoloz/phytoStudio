    items.push(["Delete", deleteSelection, ICON_TRASH]);
  }
  else if (kind === "edge") {
    items.push(["Association", () => setSelectedEdgeRelation("--"), REL_ICONS["--"]]);
    items.push(["Directed", () => setSelectedEdgeRelation("-->"), REL_ICONS["-->"]]);
    items.push(["Inheritance", () => setSelectedEdgeRelation("<|--"), REL_ICONS["<|--"]]);
    items.push(["Composition", () => setSelectedEdgeRelation("*--"), REL_ICONS["*--"]]);
    items.push(["Aggregation", () => setSelectedEdgeRelation("o--"), REL_ICONS["o--"]]);
    items.push(["Dependency", () => setSelectedEdgeRelation("..>"), REL_ICONS["..>"]]);
    items.push(["Delete", deleteSelection, ICON_TRASH]);
  }
  else {
    items.push(["Add Class / Node", () => els.addNode.click()]);
    items.push(["Fit Canvas", fitCanvasToDiagram]);
    items.push(["Auto Layout", autoLayoutGraph]);
    items.push(["Validate", validateDiagram]);
  }

  els.contextMenu.innerHTML = "";
  for (const [label, action, icon] of items) {
    const button = document.createElement("button");
    button.type = "button";
    if (icon) {
      button.innerHTML = `${icon}<span>${label}</span>`;
    }
    else {
      button.textContent = label;
    }
    button.addEventListener("click", () => {
      hideContextMenu();
      action();
    });
    els.contextMenu.appendChild(button);
  }
  els.contextMenu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  els.contextMenu.style.top = `${Math.min(y, window.innerHeight - 280)}px`;
  els.contextMenu.classList.remove("hidden");
}

function hideContextMenu() {
  els.contextMenu.classList.add("hidden");
}

function setSelectedEdgeRelation(relation) {
  const edge = getSelectedEdge();
  if (!edge) return;
  const previous = snapshotState();
  edge.relation = relation;
  pushUndoSnapshot(previous);
  updateEditorFromGraph();
  renderBuilder();
  autoOrganizeAfterMutation();
}

async function openWorkspaceFolder() {
  if (state.isDirty && !window.confirm("You have unsaved changes. Continue without saving?")) return;
  const result = await api.workspace.chooseFolder();
  if (!result) return;
  state.currentWorkspaceRoot = result.root;
  state.activeFile = null;
  els.currentFile.textContent = result.root;
  updateExportPanel();
  setDirty(false);
  await loadFiles();
  setSideView("files");
  appendConsole(`Opened workspace: ${result.root}`);
}

const commandRegistry = [
  { id: "new", label: "New Diagram", keys: "Ctrl+N", run: createNewFile },
  { id: "save", label: "Save", keys: "Ctrl+S", run: saveActiveFile },
  { id: "saveAs", label: "Save As", keys: "Ctrl+Shift+S", run: saveAsFile },
  { id: "openWorkspace", label: "Open Workspace", keys: "Ctrl+O", run: openWorkspaceFolder },
  { id: "export", label: "Export Current As", keys: "Ctrl+E", run: exportCurrentAs },
  { id: "validate", label: "Validate Diagram", keys: "Ctrl+Shift+V", run: validateDiagram },
  { id: "fit", label: "Fit Canvas", keys: "Ctrl+0", run: fitCanvasToDiagram },
  { id: "organize", label: "Organize From Export", keys: "", run: organizeFromExport },
  { id: "layout", label: "Auto Layout", keys: "", run: autoLayoutGraph },
  { id: "builder", label: "Show Builder", keys: "", run: () => setSideView("builder") },
  { id: "preview", label: "Show Live Preview", keys: "", run: () => setSideView("preview") },
  { id: "files", label: "Show Files", keys: "", run: () => setSideView("files") },
  { id: "properties", label: "Show Properties", keys: "", run: () => setSideView("properties") },
  { id: "console", label: "Show Console", keys: "", run: () => setSideView("console") }
];

function renderCommandList(filter = "") {
  const query = filter.trim().toLowerCase();
  els.commandList.innerHTML = "";
  const matches = commandRegistry.filter((command) => command.label.toLowerCase().includes(query));
  for (const command of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<span>${escapeHtml(command.label)}</span><kbd>${escapeHtml(command.keys)}</kbd>`;
    button.addEventListener("click", () => {
      closeCommandPalette();
      command.run();
    });
    els.commandList.appendChild(button);
  }
}

function openCommandPalette() {
  renderCommandList();
  els.commandSearch.value = "";
  els.commandPalette.classList.remove("hidden");
  els.commandSearch.focus();
}

function closeCommandPalette() {
  els.commandPalette.classList.add("hidden");
}

els.codeEditor.addEventListener("input", () => {
  setDirty(true);
  if (state.activeFile) state.thumbnailCache.delete(fileKey(state.activeFile));
  updateBuilderFromEditor();
  schedulePreview();
  scheduleDraftSave();
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isSourceEditor = target === els.codeEditor;
  const isInlineEditor = target?.isContentEditable;
  const key = event.key.toLowerCase();

  if (event.key === "Escape") {
    hideContextMenu();
    closeCommandPalette();
    closeSettingsModal();
    if (isSidePanelOpen()) {
      closeSidePanel();
    }
    if (state.pendingConnectionId) {
      state.pendingConnectionId = null;
      renderBuilder();
    }
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    const isTextField = isSourceEditor || isInlineEditor
      || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (!isTextField && (state.selectedNodeId || state.selectedEdgeIndex !== null)) {
      event.preventDefault();
      deleteSelection();
    }
    return;
  }

  if (!event.ctrlKey || event.altKey) return;

  if (key === "p" && event.shiftKey) {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (key === "s" && event.shiftKey) {
    event.preventDefault();
    saveAsFile();
    return;
  }
  if (key === "s") {
    event.preventDefault();
    saveActiveFile();
    return;
  }
  if (key === "n") {
    event.preventDefault();
    createNewFile();
    return;
  }
  if (key === "o") {
    event.preventDefault();
    openWorkspaceFolder();
    return;
  }
  if (key === "e") {
    event.preventDefault();
    exportCurrentAs();
