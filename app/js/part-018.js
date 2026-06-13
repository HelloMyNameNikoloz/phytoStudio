  renderBuilder();
});

els.commandSearch.addEventListener("input", () => renderCommandList(els.commandSearch.value));
els.commandSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = els.commandList.querySelector("button");
    first?.click();
  }
});
els.commandPalette.addEventListener("click", (event) => {
  if (event.target === els.commandPalette) closeCommandPalette();
});

els.minimizeWindow.addEventListener("click", api.window.minimize);
els.maximizeWindow.addEventListener("click", api.window.maximize);
els.closeWindow.addEventListener("click", api.window.close);

// When the window is closing with unsaved changes, the main process asks us to
// save first. Report back whether the save succeeded or the user cancelled so
// main can decide whether to actually close.
api.app?.onBeforeClose?.(() => {
  saveActiveFile()
    .then((saved) => api.app.respondBeforeClose(saved ? "saved" : "cancel"))
    .catch((error) => {
      showToast(`Save failed: ${error.message}`, "error");
      api.app.respondBeforeClose("cancel");
    });
});

window.addEventListener("resize", () => {
  refreshAfterLayoutChange();
  requestAnimationFrame(fitPreviewToViewport);
});

function restoreDraftIfWanted() {
  const raw = localStorage.getItem("phyto:draft");
  if (!raw) return false;
  let draft = null;
  try {
    draft = JSON.parse(raw);
  }
  catch {
    return false;
  }
  if (!draft?.isDirty || !draft.source) return false;
  const shouldRestore = window.confirm(`Restore unsaved draft from ${new Date(draft.savedAt).toLocaleString()}?`);
  if (!shouldRestore) return false;
  state.activeFile = draft.activeFile || null;
  els.codeEditor.value = draft.source;
  els.currentFile.textContent = draft.activeFile ? fileDisplayPath(draft.activeFile) : "Recovered unsaved diagram";
  setMode(draft.mode || "Mermaid");
  setDirty(true);
  renderFileList();
  setSideView("builder");
  appendConsole("Recovered unsaved draft.");
  return true;
}

function getLastWorkedFile() {
  let last = null;
  try {
    last = JSON.parse(localStorage.getItem("phyto:lastFile") || "null");
  }
  catch {
    last = null;
  }
  if (fileKey(last)) {
    const existing = state.files.find((file) => fileKey(file) === fileKey(last));
    if (existing) return existing;
    if (last.absolutePath) return last;
  }

  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem("phyto:recent") || "[]");
  }
  catch {
    recent = [];
  }
  for (const item of recent) {
    const existing = state.files.find((file) => fileKey(file) === fileKey(item));
    if (existing) return existing;
    if (item.absolutePath) return item;
  }
  return null;
}

async function start() {
  applyTheme(state.settings.theme);
  setAutosave(state.settings.autosave);
  setEditorSplitRatio(state.editorSplitRatio);
  restoreSidebarState();
  els.codeEditor.value = templates.Mermaid;
  await loadFiles();
  if (restoreDraftIfWanted()) {
    return;
  }
  const candidates = [
    getLastWorkedFile(),
    state.files.find((file) => file.name === "flowchart.mmd"),
    state.files.find((file) => file.kind === "Mermaid")
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (api.workspace.fileExists && !(await api.workspace.fileExists(file))) {
        appendConsole(`Skipped missing file ${fileDisplayPath(file)}`);
        continue;
      }
      await openFile(file);
      return;
    }
    catch (error) {
      appendConsole(`Could not open ${fileDisplayPath(file)}: ${error.message}`);
    }
  }

  updateBuilderFromEditor();
  setSideView("builder");
}

start().catch((error) => {
  setConsole(error.message);
});
