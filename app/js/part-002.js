  menuNewFile: document.getElementById("menuNewFile"),
  menuOpenWorkspace: document.getElementById("menuOpenWorkspace"),
  menuSaveFile: document.getElementById("menuSaveFile"),
  menuSaveAs: document.getElementById("menuSaveAs"),
  menuExport: document.getElementById("menuExport"),
  menuExportAs: document.getElementById("menuExportAs"),
  menuOpenOutput: document.getElementById("menuOpenOutput"),
  menuRevealFile: document.getElementById("menuRevealFile"),
  menuUndo: document.getElementById("menuUndo"),
  menuRedo: document.getElementById("menuRedo"),
  menuDuplicate: document.getElementById("menuDuplicate"),
  menuDelete: document.getElementById("menuDelete"),
  menuCommandPalette: document.getElementById("menuCommandPalette"),
  menuBuilder: document.getElementById("menuBuilder"),
  menuFiles: document.getElementById("menuFiles"),
  menuPreview: document.getElementById("menuPreview"),
  menuProperties: document.getElementById("menuProperties"),
  menuConsole: document.getElementById("menuConsole"),
  menuFitCanvas: document.getElementById("menuFitCanvas"),
  menuZoomResetCanvas: document.getElementById("menuZoomResetCanvas"),
  menuAddClass: document.getElementById("menuAddClass"),
  menuAddRelationship: document.getElementById("menuAddRelationship"),
  menuOrganize: document.getElementById("menuOrganize"),
  menuValidate: document.getElementById("menuValidate"),
  menuAutoLayout: document.getElementById("menuAutoLayout"),
  menuSettings: document.getElementById("menuSettings"),
  saveStatus: document.getElementById("saveStatus"),
  settingsModal: document.getElementById("settingsModal"),
  settingsClose: document.getElementById("settingsClose"),
  settingsAutosave: document.getElementById("settingsAutosave"),
  settingsTheme: document.getElementById("settingsTheme"),
  sidePanel: document.getElementById("sidePanel"),
  sideOverlayBackdrop: document.getElementById("sideOverlayBackdrop"),
  sidePanelClose: document.getElementById("sidePanelClose"),
  consoleResizeHandle: document.getElementById("consoleResizeHandle"),
  stage: document.querySelector(".stage"),
  editorGrid: document.getElementById("editorGrid"),
  editorResizeHandle: document.getElementById("editorResizeHandle"),
  organizeOverlay: document.getElementById("organizeOverlay"),
  canvasViewport: document.getElementById("canvasViewport"),
  canvas: document.getElementById("canvas"),
  edgeLayer: document.getElementById("edgeLayer"),
  minimap: document.getElementById("minimap"),
  fitCanvas: document.getElementById("fitCanvas"),
  zoomOutCanvas: document.getElementById("zoomOutCanvas"),
  zoomResetCanvas: document.getElementById("zoomResetCanvas"),
  zoomInCanvas: document.getElementById("zoomInCanvas"),
  contextMenu: document.getElementById("contextMenu"),
  relationshipPopover: document.getElementById("relationshipPopover"),
  relationButtons: document.getElementById("relationButtons"),
  popoverFromMultiplicity: document.getElementById("popoverFromMultiplicity"),
  popoverToMultiplicity: document.getElementById("popoverToMultiplicity"),
  popoverLabel: document.getElementById("popoverLabel"),
  popoverDeleteRelationship: document.getElementById("popoverDeleteRelationship"),
  popoverCloseRelationship: document.getElementById("popoverCloseRelationship"),
  commandPalette: document.getElementById("commandPalette"),
  commandSearch: document.getElementById("commandSearch"),
  commandList: document.getElementById("commandList"),
  emptyBuilder: document.getElementById("emptyBuilder"),
  codeEditor: document.getElementById("codeEditor"),
  currentFile: document.getElementById("currentFile"),
  newDiagramFromFiles: document.getElementById("newDiagramFromFiles"),
  syncStatus: document.getElementById("syncStatus"),
  builderHint: document.getElementById("builderHint"),
  consoleOutput: document.getElementById("consoleOutput"),
  clearConsole: document.getElementById("clearConsole"),
  checkTools: document.getElementById("checkTools"),
  renderPlantUml: document.getElementById("renderPlantUml"),
  renderMermaid: document.getElementById("renderMermaid"),
  renderAll: document.getElementById("renderAll"),
  openOutput: document.getElementById("openOutput"),
  minimizeWindow: document.getElementById("minimizeWindow"),
  maximizeWindow: document.getElementById("maximizeWindow"),
  closeWindow: document.getElementById("closeWindow")
};

function setConsole(text) {
  els.consoleOutput.textContent = text || "Ready.";
}

function appendConsole(text) {
  els.consoleOutput.textContent = `${els.consoleOutput.textContent}\n${text}`.trim();
  els.consoleOutput.scrollTop = els.consoleOutput.scrollHeight;
}

const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
};

// Transient feedback surfaced over the whole app, independent of which side
// panel happens to be open. Click to dismiss early; auto-dismisses otherwise.
function showToast(message, type = "info", duration = 3400) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span><span class="toast-msg"></span>`;
  toast.querySelector(".toast-msg").textContent = message;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    window.clearTimeout(timer);
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  };

  const timer = window.setTimeout(remove, type === "error" ? Math.max(duration, 5200) : duration);
  toast.addEventListener("click", remove);

  if (type === "error") bumpConsoleBadge();
}

function persistDraft() {
  const draft = {
    activeFile: state.activeFile,
    mode: state.mode,
    source: els.codeEditor.value,
    isDirty: state.isDirty,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem("phyto:draft", JSON.stringify(draft));
}

async function autoSaveActiveFile() {
  if (!state.settings.autosave || !state.activeFile || !state.isDirty) return;
  try {
    await api.workspace.saveFile(state.activeFile, els.codeEditor.value);
    setDirty(false);
    updateSaveStatus(`Autosaved ${formatTime()}`, "ok");
    state.thumbnailCache.delete(fileKey(state.activeFile));
    persistDraft();
  }
  catch (error) {
    appendConsole(`Autosave failed: ${error.message}`);
    updateSaveStatus("Autosave failed", "error");
  }
}

function scheduleDraftSave() {
  window.clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = window.setTimeout(() => {
    persistDraft();
    autoSaveActiveFile();
  }, 650);
}

function fileKey(file) {
  return file?.absolutePath || file?.relativePath || "";
}

function fileDisplayPath(file) {
  return file?.relativePath || file?.absolutePath || "Unsaved current diagram";
}

function rememberRecentFile(file) {
  if (!file) return;
  const key = fileKey(file);
  const recent = JSON.parse(localStorage.getItem("phyto:recent") || "[]")
    .filter((item) => fileKey(item) !== key);
  recent.unshift(file);
  localStorage.setItem("phyto:recent", JSON.stringify(recent.slice(0, 12)));
  localStorage.setItem("phyto:lastFile", JSON.stringify(file));
}

function applyTheme(theme) {
  state.settings.theme = theme || "aurora";
  document.body.dataset.theme = state.settings.theme;
  localStorage.setItem("phyto:theme", state.settings.theme);
  if (els.settingsTheme) els.settingsTheme.value = state.settings.theme;
}

function setAutosave(enabled) {
