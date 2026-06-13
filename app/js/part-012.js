  for (const file of items) {
    els.recentList.appendChild(makeFileItem(file));
  }
}

function showFileMenu(file, x, y) {
  const items = [
    ["Open", () => openFile(file)],
    ["Save Copy As...", () => renameFilePrompt(file)],
    ...(file.relativePath ? [["Duplicate", () => duplicateFile(file)]] : []),
    ["Reveal in Explorer", () => api.workspace.revealFile(file)],
    ...(file.relativePath ? [["Delete", () => deleteFilePrompt(file), ICON_TRASH]] : [])
  ];

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
  els.contextMenu.style.top = `${Math.min(y, window.innerHeight - 240)}px`;
  els.contextMenu.classList.remove("hidden");
}

async function renameFilePrompt(file) {
  try {
    const content = await api.workspace.readFile(file);
    const result = await api.workspace.saveFileAs({
      kind: file.kind,
      content,
      defaultName: file.name
    });
    if (result?.canceled || !result?.file) return;
    if (fileKey(state.activeFile) === fileKey(file)) {
      state.activeFile = result.file;
      els.currentFile.textContent = fileDisplayPath(result.file);
      updateExportPanel();
      rememberRecentFile(result.file);
      persistDraft();
    }
    await loadFiles();
    showToast(`Saved as ${result.file.name}`, "success");
  }
  catch (error) {
    showToast(`Save as failed: ${error.message}`, "error");
  }
}

async function duplicateFile(file) {
  try {
    const copy = await api.workspace.duplicateFile(file.relativePath);
    await loadFiles();
    showToast(`Duplicated as ${copy.name}`, "success");
  }
  catch (error) {
    showToast(`Duplicate failed: ${error.message}`, "error");
  }
}

async function deleteFilePrompt(file) {
  if (!window.confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
  try {
    await api.workspace.deleteFile(file.relativePath);
    if (state.activeFile?.relativePath === file.relativePath) {
      state.activeFile = null;
      els.currentFile.textContent = "No file selected";
      updateExportPanel();
    }
    await loadFiles();
    showToast(`Deleted ${file.name}`, "success");
  }
  catch (error) {
    showToast(`Delete failed: ${error.message}`, "error");
  }
}

async function loadFiles() {
  state.files = await api.workspace.listFiles();
  state.files.sort((a, b) => `${a.kind}-${a.name}`.localeCompare(`${b.kind}-${b.name}`));
  renderFileList();
}

async function openFile(file) {
  if (state.isDirty) {
    const shouldContinue = window.confirm("You have unsaved changes. Continue without saving?");
    if (!shouldContinue) return;
  }

  const content = await api.workspace.readFile(file);
  state.activeFile = file;
  els.codeEditor.value = content;
  els.currentFile.textContent = fileDisplayPath(file);
  updateExportPanel();
  setMode(file.kind);
  setDirty(false);
  rememberRecentFile(file);
  persistDraft();
  renderFileList();
  setSideView("builder");
  schedulePreview(100);
  if (shouldAutoOrganize()) {
    window.setTimeout(() => organizeFromExport().catch((error) => appendConsole(error.message)), 250);
  }
}

// Create a brand-new file, surfacing a real overwrite prompt instead of letting
// the underlying "wx" write fail silently when the name already exists.
// Returns the file descriptor, or null if the user declined to overwrite.
async function createFile(kind, fileName, content) {
  try {
    return await api.workspace.saveNewFile(kind, fileName, content);
  }
  catch (error) {
    if (/eexist|already exists/i.test(error.message || "")) {
      if (window.confirm(`"${fileName}" already exists. Overwrite it?`)) {
        return await api.workspace.saveNewFile(kind, fileName, content, true);
      }
      return null;
    }
    throw error;
  }
}

// Returns true when the file was written, false when the user cancelled.
async function saveActiveFile() {
  try {
    if (!state.activeFile) {
      return saveAsFile();
    }
    else {
      await api.workspace.saveFile(state.activeFile, els.codeEditor.value);
    }
    setDirty(false);
    updateSaveStatus(`Saved ${formatTime()}`, "ok");
    state.thumbnailCache.delete(fileKey(state.activeFile));
    rememberRecentFile(state.activeFile);
    persistDraft();
    appendConsole(`Saved ${fileDisplayPath(state.activeFile)}`);
    showToast(`Saved ${state.activeFile.name || state.activeFile.relativePath}`, "success");
    return true;
  }
  catch (error) {
    appendConsole(`Save failed: ${error.message}`);
    showToast(`Save failed: ${error.message}`, "error");
    return false;
  }
}

async function saveAsFile() {
  const defaultName = state.activeFile?.name || (state.mode === "PlantUML" ? "new-diagram.puml" : "new-diagram.mmd");

  try {
    const result = await api.workspace.saveFileAs({
      kind: state.mode,
      content: els.codeEditor.value,
      defaultName
    });
    if (result?.canceled || !result?.file) return false;
    const file = result.file;
    state.activeFile = file;
    els.currentFile.textContent = fileDisplayPath(file);
    updateExportPanel();
    await loadFiles();
    renderFileList();
    setDirty(false);
    updateSaveStatus(`Saved ${formatTime()}`, "ok");
    state.thumbnailCache.delete(fileKey(file));
    rememberRecentFile(file);
    persistDraft();
