const templates = {
  Mermaid: `flowchart TD
    Start([Start])
    Login[Login]
    Browse[Browse Products]
    AddToCart[Add To Cart]
    Checkout[Checkout]
    Payment[Payment]
    Success([Success])

    Start --> Login
    Login --> Browse
    Browse --> AddToCart
    AddToCart --> Checkout
    Checkout --> Payment
    Payment --> Success
`,
  PlantUML: `@startuml
title New Diagram

actor User
participant App

User -> App: Start
App --> User: Done

@enduml
`
};

const api = window.phytoStudio || {
  window: {
    minimize: () => {},
    maximize: () => {},
    close: () => {}
  },
  workspace: {
    listFiles: async () => [
      { name: "flowchart.mmd", kind: "Mermaid", relativePath: "diagrams/mermaid/flowchart.mmd" },
      { name: "class-diagram.puml", kind: "PlantUML", relativePath: "diagrams/plantuml/class-diagram.puml" }
    ],
    readFile: async (target) => (target.relativePath || target.absolutePath || target).endsWith(".puml") ? templates.PlantUML : templates.Mermaid,
    saveFile: async () => ({ ok: true }),
    saveFileAs: async ({ kind, defaultName }) => ({
      ok: true,
      file: {
        name: defaultName,
        kind,
        relativePath: `${kind === "PlantUML" ? "diagrams/plantuml" : "diagrams/mermaid"}/${defaultName}`
      }
    }),
    saveNewFile: async (kind, fileName) => ({
      name: fileName,
      kind,
      relativePath: `${kind === "PlantUML" ? "diagrams/plantuml" : "diagrams/mermaid"}/${fileName}`
    }),
    chooseFolder: async () => null,
    revealFile: async () => {},
    renameFile: async (relativePath, newName) => ({ name: newName, kind: relativePath.endsWith(".puml") ? "PlantUML" : "Mermaid", relativePath }),
    duplicateFile: async (relativePath) => ({ name: "copy", kind: relativePath.endsWith(".puml") ? "PlantUML" : "Mermaid", relativePath }),
    deleteFile: async () => ({ ok: true })
  },
  tools: {
    check: async () => ({ code: 0, output: "Preview mode: run inside Electron to check local tools." }),
    renderPlantUml: async () => ({ code: 0, output: "Preview mode: run inside Electron to render PlantUML." }),
    renderMermaid: async () => ({ code: 0, output: "Preview mode: run inside Electron to render Mermaid." }),
    renderAll: async () => ({ code: 0, output: "Preview mode: run inside Electron to render all diagrams." }),
    openOutput: async () => {}
  },
  preview: {
    render: async () => ({
      ok: true,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="240" viewBox="0 0 460 240">
        <rect width="460" height="240" fill="#ffffff"/>
        <rect x="72" y="72" width="140" height="72" rx="8" fill="#f2f5ff" stroke="#4361ee" stroke-width="2"/>
        <rect x="248" y="72" width="140" height="72" rx="8" fill="#fff0f7" stroke="#f72585" stroke-width="2"/>
        <path d="M212 108 L248 108" stroke="#3a0ca3" stroke-width="2" marker-end="url(#arrow)"/>
        <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#3a0ca3"/></marker></defs>
        <text x="142" y="114" text-anchor="middle" font-family="Segoe UI" font-size="16" fill="#111">Source</text>
        <text x="318" y="114" text-anchor="middle" font-family="Segoe UI" font-size="16" fill="#111">Preview</text>
      </svg>`
    })
  },
  export: {
    current: async () => ({ ok: true, path: "preview-export.svg" })
  },
  app: {
    setDirty: () => {},
    onBeforeClose: () => {},
    respondBeforeClose: () => {}
  }
};

const state = {
  files: [],
  activeFile: null,
  mode: "Mermaid",
  graph: { nodes: [], edges: [] },
  selectedNodeId: null,
  selectedEdgeIndex: null,
  pendingConnectionId: null,
  builderType: "none",
  plantUmlMeta: { title: "Class Diagram", direction: "left to right direction" },
  isDirty: false,
  isDragging: false,
  previewTimer: null,
  previewRequestId: 0,
  lastPreviewSvg: "",
  previewZoom: 1,
  canvasZoom: 1,
  canvasPan: { x: 0, y: 0 },
  canvasWorld: { width: 2400, height: 1600 },
  history: {
    undo: [],
    redo: [],
    limit: 80
  },
  inlineEdit: null,
  autoSaveTimer: null,
  currentWorkspaceRoot: null,
  isOrganizing: false,
  activeSideSection: "files",
  consolePanelHeight: Number(localStorage.getItem("phyto:consoleHeight") || 300),
  editorSplitRatio: Number(localStorage.getItem("phyto:editorSplitRatio") || 80),
  settings: {
    autosave: localStorage.getItem("phyto:autosave") !== "false",
    theme: localStorage.getItem("phyto:theme") || "aurora"
  },
  thumbnailCache: new Map(),
  suppressNextDocumentClick: false
};

const els = {
  fileList: document.getElementById("fileList"),
  refreshFiles: document.getElementById("refreshFiles"),
  modeMermaid: document.getElementById("modeMermaid"),
  modePlantUml: document.getElementById("modePlantUml"),
  newFile: document.getElementById("newFile"),
  saveFile: document.getElementById("saveFile"),
  addNode: document.getElementById("addNode"),
  connectNodes: document.getElementById("connectNodes"),
  deleteNode: document.getElementById("deleteNode"),
  organizeDiagram: document.getElementById("organizeDiagram"),
  exportCurrent: document.getElementById("exportCurrent"),
  exportAs: document.getElementById("exportAs"),
  refreshPreview: document.getElementById("refreshPreview"),
  zoomOutPreview: document.getElementById("zoomOutPreview"),
  zoomResetPreview: document.getElementById("zoomResetPreview"),
  zoomInPreview: document.getElementById("zoomInPreview"),
  previewSurface: document.getElementById("previewSurface"),
  previewEmpty: document.getElementById("previewEmpty"),
  previewStatus: document.getElementById("previewStatus"),
  activityBuilder: document.getElementById("activityBuilder"),
  activityFiles: document.getElementById("activityFiles"),
  activityPreview: document.getElementById("activityPreview"),
  activityProperties: document.getElementById("activityProperties"),
  activityExport: document.getElementById("activityExport"),
  activityConsole: document.getElementById("activityConsole"),
  workspace: document.getElementById("workspace"),
  fileSearch: document.getElementById("fileSearch"),
  fileRecent: document.getElementById("fileRecent"),
  recentList: document.getElementById("recentList"),
  consoleBadge: document.getElementById("consoleBadge"),
  activityConsoleBadge: document.getElementById("activityConsoleBadge"),
  propertiesEmpty: document.getElementById("propertiesEmpty"),
  nodeProperties: document.getElementById("nodeProperties"),
  edgeProperties: document.getElementById("edgeProperties"),
  propNodeName: document.getElementById("propNodeName"),
  propNodeAttributes: document.getElementById("propNodeAttributes"),
  propNodeMethods: document.getElementById("propNodeMethods"),
  applyNodeProperties: document.getElementById("applyNodeProperties"),
  propEdgeRelation: document.getElementById("propEdgeRelation"),
  propEdgeFromMultiplicity: document.getElementById("propEdgeFromMultiplicity"),
  propEdgeToMultiplicity: document.getElementById("propEdgeToMultiplicity"),
  propEdgeLabel: document.getElementById("propEdgeLabel"),
  applyEdgeProperties: document.getElementById("applyEdgeProperties"),
  exportFormat: document.getElementById("exportFormat"),
  exportBackground: document.getElementById("exportBackground"),
  exportCurrentName: document.getElementById("exportCurrentName"),
  exportCurrentAs: document.getElementById("exportCurrentAs"),
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
  state.settings.autosave = Boolean(enabled);
  localStorage.setItem("phyto:autosave", String(state.settings.autosave));
  if (els.settingsAutosave) els.settingsAutosave.checked = state.settings.autosave;
  updateSaveStatus(state.settings.autosave ? "Autosave on" : "Autosave off", state.settings.autosave ? "ok" : "neutral");
  if (state.settings.autosave) scheduleDraftSave();
}

function setCommandButton(button, icon, label) {
  if (!button) return;
  button.innerHTML = `<span class="button-icon">${icon}</span><span>${label}</span>`;
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateSaveStatus(text, kind = "neutral") {
  if (!els.saveStatus) return;
  els.saveStatus.textContent = text;
  els.saveStatus.dataset.kind = kind;
}

function openSettingsModal() {
  closeMenus();
  els.settingsModal?.classList.remove("hidden");
}

function closeSettingsModal() {
  els.settingsModal?.classList.add("hidden");
}

function applyCanvasTransform() {
  const transform = `translate(${state.canvasPan.x}px, ${state.canvasPan.y}px) scale(${state.canvasZoom})`;
  els.canvas.style.transform = transform;
  els.edgeLayer.style.transform = transform;
  els.zoomResetCanvas.textContent = `${Math.round(state.canvasZoom * 100)}%`;
  renderMinimap();
}

function setCanvasZoom(nextZoom, anchor = null) {
  const previousZoom = state.canvasZoom;
  const zoom = Math.min(2.5, Math.max(0.25, nextZoom));
  if (anchor) {
    const worldX = (anchor.x - state.canvasPan.x) / previousZoom;
    const worldY = (anchor.y - state.canvasPan.y) / previousZoom;
    state.canvasPan.x = anchor.x - worldX * zoom;
    state.canvasPan.y = anchor.y - worldY * zoom;
  }
  state.canvasZoom = zoom;
  applyCanvasTransform();
}

function getGraphBounds() {
  if (state.graph.nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 900, maxY: 600 };
  }
  const widths = state.builderType === "plantuml-class" ? 230 : 150;
  const heights = state.builderType === "plantuml-class" ? 130 : 70;
  return {
    minX: Math.min(...state.graph.nodes.map((node) => node.x)),
    minY: Math.min(...state.graph.nodes.map((node) => node.y)),
    maxX: Math.max(...state.graph.nodes.map((node) => node.x + widths)),
    maxY: Math.max(...state.graph.nodes.map((node) => node.y + heights))
  };
}

function fitCanvasToDiagram() {
  const viewport = els.canvasViewport.getBoundingClientRect();
  const bounds = getGraphBounds();
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const zoom = Math.min(1.35, Math.max(0.25, Math.min((viewport.width - 96) / width, (viewport.height - 96) / height)));
  state.canvasZoom = zoom;
  state.canvasPan.x = 48 - bounds.minX * zoom;
  state.canvasPan.y = 48 - bounds.minY * zoom;
  applyCanvasTransform();
}

function resetCanvasZoom() {
  state.canvasZoom = 1;
  state.canvasPan = { x: 0, y: 0 };
  applyCanvasTransform();
}

function renderMinimap() {
  if (!els.minimap) return;
  els.minimap.innerHTML = "";
  const bounds = getGraphBounds();
  const pad = 10;
  const miniWidth = 156;
  const miniHeight = 106;
  const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((miniWidth - pad * 2) / graphWidth, (miniHeight - pad * 2) / graphHeight);

  for (const node of state.graph.nodes) {
    const item = document.createElement("div");
    item.className = "minimap-node";
    item.classList.toggle("selected", node.id === state.selectedNodeId);
    item.style.left = `${pad + (node.x - bounds.minX) * scale}px`;
    item.style.top = `${pad + (node.y - bounds.minY) * scale}px`;
    item.style.width = `${Math.max(8, 120 * scale)}px`;
    item.style.height = `${Math.max(5, 70 * scale)}px`;
    els.minimap.appendChild(item);
  }

  const viewport = els.canvasViewport?.getBoundingClientRect();
  if (viewport) {
    const view = document.createElement("div");
    view.className = "minimap-view";
    const worldLeft = (-state.canvasPan.x / state.canvasZoom) - bounds.minX;
    const worldTop = (-state.canvasPan.y / state.canvasZoom) - bounds.minY;
    view.style.left = `${pad + worldLeft * scale}px`;
    view.style.top = `${pad + worldTop * scale}px`;
    view.style.width = `${Math.max(12, (viewport.width / state.canvasZoom) * scale)}px`;
    view.style.height = `${Math.max(8, (viewport.height / state.canvasZoom) * scale)}px`;
    els.minimap.appendChild(view);
  }
}

const SECTION_NAMES = ["files", "properties", "preview", "export", "console"];

function sectionEl(name) {
  return document.getElementById(`section-${name}`);
}

function isSectionOpen(name) {
  const el = sectionEl(name);
  return el ? !el.classList.contains("collapsed") : false;
}

function persistSidebarState() {
  const open = {};
  for (const name of SECTION_NAMES) open[name] = isSectionOpen(name);
  localStorage.setItem("phyto:sidebar", JSON.stringify({
    active: state.activeSideSection || SECTION_NAMES.find((name) => open[name]) || "files",
    open,
    collapsed: !isSidePanelOpen()
  }));
}

function refreshAfterLayoutChange() {
  requestAnimationFrame(() => {
    renderEdges();
    renderMinimap();
  });
}

function setSectionOpen(name, open) {
  const el = sectionEl(name);
  if (!el) return;
  el.classList.toggle("collapsed", !open);
  el.querySelector(".side-section-toggle")?.setAttribute("aria-expanded", String(open));
  if (open && name === "console") clearConsoleBadge();
  if (open && name === "preview") schedulePreview(0);
}

function openOnlySection(name) {
  state.activeSideSection = name;
  for (const sectionName of SECTION_NAMES) {
    setSectionOpen(sectionName, sectionName === name);
  }
}

function toggleSection(name) {
  if (isSectionOpen(name) && isSidePanelOpen()) {
    closeSidePanel();
  }
  else {
    revealSection(name);
  }
}

function setSidebarCollapsed(collapsed) {
  if (collapsed) {
    closeSidePanel();
  }
  else {
    revealSection(state.activeSideSection || "files");
  }
}

function isSidePanelOpen() {
  return Boolean(
    els.workspace?.classList.contains("panel-overlay-open")
      || els.workspace?.classList.contains("console-panel-open")
  );
}

function updateActivityState() {
  const activeName = isSidePanelOpen() ? state.activeSideSection : null;
  for (const button of document.querySelectorAll(".activity-button[data-reveal]")) {
    button.classList.toggle("active", button.dataset.reveal === activeName);
  }
  els.activityBuilder?.classList.toggle("active", !activeName);
}

function setConsolePanelHeight(height) {
  const max = Math.round(window.innerHeight * 0.78);
  const next = Math.min(Math.max(Math.round(height), 168), Math.max(168, max));
  state.consolePanelHeight = next;
  els.workspace?.style.setProperty("--console-panel-height", `${next}px`);
  localStorage.setItem("phyto:consoleHeight", String(next));
}

function setEditorSplitRatio(ratio) {
  const next = Math.min(Math.max(Math.round(ratio), 55), 90);
  state.editorSplitRatio = next;
  if (els.editorGrid) {
    els.editorGrid.style.gridTemplateColumns = `minmax(300px, ${next}fr) 8px minmax(240px, ${100 - next}fr)`;
  }
  localStorage.setItem("phyto:editorSplitRatio", String(next));
  refreshAfterLayoutChange();
}

function openSidePanel(name) {
  openOnlySection(name);
  els.workspace?.classList.remove("sidebar-collapsed", "panel-overlay-open", "console-panel-open");
  els.workspace?.classList.add(name === "console" ? "console-panel-open" : "panel-overlay-open");
  if (name === "console") setConsolePanelHeight(state.consolePanelHeight);
  if (name === "preview") requestAnimationFrame(fitPreviewToViewport);
  updateActivityState();
  persistSidebarState();
  refreshAfterLayoutChange();
}

function closeSidePanel({ persist = true } = {}) {
  els.workspace?.classList.remove("panel-overlay-open", "console-panel-open");
  updateActivityState();
  if (persist) persistSidebarState();
  refreshAfterLayoutChange();
}

function revealSection(name) {
  openSidePanel(name);
  els.sidePanel?.scrollTo({ top: 0, behavior: "smooth" });
}

// Backwards-compatible entry point. "builder" just refocuses the canvas (the
// stage is always visible now); any other name reveals its sidebar section.
function setSideView(viewName) {
  if (viewName === "builder") {
    closeSidePanel();
    refreshAfterLayoutChange();
    return;
  }
  revealSection(viewName);
}

function restoreSidebarState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem("phyto:sidebar") || "null");
  }
  catch {
    saved = null;
  }
  const savedActive = SECTION_NAMES.includes(saved?.active) ? saved.active : null;
  const legacyActive = saved?.open ? SECTION_NAMES.find((name) => saved.open[name]) : null;
  openOnlySection(savedActive || legacyActive || "files");
  setConsolePanelHeight(state.consolePanelHeight);
  closeSidePanel({ persist: false });
}

function bumpConsoleBadge() {
  if (isSectionOpen("console") && els.workspace?.classList.contains("console-panel-open")) return;
  state.consoleUnread = (state.consoleUnread || 0) + 1;
  const text = state.consoleUnread > 99 ? "99+" : String(state.consoleUnread);
  for (const badge of [els.consoleBadge, els.activityConsoleBadge]) {
    if (!badge) continue;
    badge.textContent = text;
    badge.hidden = false;
  }
}

function clearConsoleBadge() {
  state.consoleUnread = 0;
  for (const badge of [els.consoleBadge, els.activityConsoleBadge]) {
    if (badge) badge.hidden = true;
  }
}

function closeMenus() {
  document.querySelectorAll(".menu-group.open").forEach((group) => group.classList.remove("open"));
}

function setDirty(isDirty) {
  state.isDirty = isDirty;
  els.syncStatus.textContent = isDirty ? "Unsaved" : "Synced";
  els.syncStatus.classList.toggle("dirty", isDirty);
  if (isDirty) {
    updateSaveStatus(state.settings.autosave ? "Autosaving..." : "Unsaved changes", state.settings.autosave ? "saving" : "warning");
  }
  else {
    updateSaveStatus(state.settings.autosave ? "Autosave on" : "Autosave off", state.settings.autosave ? "ok" : "neutral");
  }
  api.app?.setDirty?.(isDirty);
}

function updateExportPanel() {
  if (!els.exportCurrentName) return;
  els.exportCurrentName.textContent = fileDisplayPath(state.activeFile);
}

function clearSelection({ hidePopover = true } = {}) {
  const hadSelection = state.selectedNodeId || state.selectedEdgeIndex !== null || state.pendingConnectionId;
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  state.pendingConnectionId = null;
  if (hidePopover) hideRelationshipPopover();
  if (!hadSelection) return;
  showProperties();
  renderBuilder();
}

function setOrganizing(isOrganizing) {
  state.isOrganizing = isOrganizing;
  els.stage?.classList.toggle("organizing", isOrganizing);
  els.sidePanel?.classList.toggle("organizing", isOrganizing);
  els.organizeOverlay?.classList.toggle("hidden", !isOrganizing);
  els.codeEditor.disabled = isOrganizing;
  for (const button of [
    els.organizeDiagram,
    els.addNode,
    els.connectNodes,
    els.deleteNode,
    els.fitCanvas,
    els.zoomOutCanvas,
    els.zoomResetCanvas,
    els.zoomInCanvas,
    els.menuOrganize,
    els.menuAutoLayout,
    els.menuAddClass,
    els.menuAddRelationship
  ]) {
    if (button) button.disabled = isOrganizing;
  }
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotState() {
  return {
    mode: state.mode,
    builderType: state.builderType,
    graph: cloneValue(state.graph),
    plantUmlMeta: cloneValue(state.plantUmlMeta),
    source: els.codeEditor.value
  };
}

function snapshotSignature(snapshot) {
  return JSON.stringify({
    mode: snapshot.mode,
    builderType: snapshot.builderType,
    graph: snapshot.graph,
    plantUmlMeta: snapshot.plantUmlMeta,
    source: snapshot.source
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

function setPreviewStatus(text, isError = false) {
  els.previewStatus.textContent = text;
  els.previewEmpty.textContent = text;
  els.previewEmpty.classList.toggle("error", isError);
}

function parseSvgNumber(value) {
  const parsed = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function getSvgNaturalSize(svg) {
  const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] };
  }

  const width = parseSvgNumber(svg.getAttribute("width"));
  const height = parseSvgNumber(svg.getAttribute("height"));
  if (width && height) return { width, height };

  try {
    const box = svg.getBBox();
    if (box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
  }
  catch {
    // Some SVGs cannot be measured until fully painted. The fallback keeps the UI stable.
  }

  return { width: 900, height: 600 };
}

function fitPreviewToViewport() {
  const svg = els.previewSurface.querySelector("svg");
  const wrap = els.previewSurface.closest(".preview-wrap");
  if (!svg || !wrap) return;

  const naturalWidth = Number(svg.dataset.naturalWidth) || getSvgNaturalSize(svg).width;
  const naturalHeight = Number(svg.dataset.naturalHeight) || getSvgNaturalSize(svg).height;
  const availableWidth = Math.max(160, wrap.clientWidth - 64);
  const availableHeight = Math.max(160, wrap.clientHeight - 64);
  const fit = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
  state.previewZoom = Math.min(Math.max(fit, 0.1), 2.5);
  applyPreviewZoom();
}

function applyPreviewZoom() {
  const svg = els.previewSurface.querySelector("svg");
  if (!svg) return;
  const naturalWidth = Number(svg.dataset.naturalWidth) || getSvgNaturalSize(svg).width;
  const naturalHeight = Number(svg.dataset.naturalHeight) || getSvgNaturalSize(svg).height;
  svg.style.width = `${naturalWidth * state.previewZoom}px`;
  svg.style.height = `${naturalHeight * state.previewZoom}px`;
  svg.style.transform = "none";
  els.zoomResetPreview.textContent = `${Math.round(state.previewZoom * 100)}%`;
}

function setPreviewSvg(svg) {
  state.lastPreviewSvg = svg;
  els.previewSurface.innerHTML = svg;
  const renderedSvg = els.previewSurface.querySelector("svg");
  if (!renderedSvg) {
    els.previewSurface.innerHTML = "";
    els.previewSurface.appendChild(els.previewEmpty);
    setPreviewStatus("Preview renderer returned no SVG.", true);
    return;
  }

  renderedSvg.removeAttribute("width");
  renderedSvg.removeAttribute("height");
  const naturalSize = getSvgNaturalSize(renderedSvg);
  renderedSvg.dataset.naturalWidth = String(naturalSize.width);
  renderedSvg.dataset.naturalHeight = String(naturalSize.height);
  renderedSvg.style.maxWidth = "none";
  renderedSvg.style.display = "block";
  requestAnimationFrame(fitPreviewToViewport);
}

async function renderLivePreview() {
  const content = els.codeEditor.value.trim();
  if (!content) {
    els.previewSurface.innerHTML = "";
    els.previewSurface.appendChild(els.previewEmpty);
    setPreviewStatus("Waiting for source");
    return;
  }

  const requestId = state.previewRequestId + 1;
  state.previewRequestId = requestId;
  setPreviewStatus("Rendering local preview...");

  const result = await api.preview.render(state.mode, els.codeEditor.value);
  if (requestId !== state.previewRequestId) return;

  if (!result.ok) {
    els.previewSurface.innerHTML = "";
    els.previewSurface.appendChild(els.previewEmpty);
    setPreviewStatus(result.error || "Preview failed.", true);
    return;
  }

  setPreviewSvg(result.svg);
  els.previewStatus.textContent = "Rendered from local exporter";
}

function schedulePreview(delay = 500) {
  window.clearTimeout(state.previewTimer);
  state.previewTimer = window.setTimeout(() => {
    renderLivePreview().catch((error) => {
      els.previewSurface.innerHTML = "";
      els.previewSurface.appendChild(els.previewEmpty);
      setPreviewStatus(error.message, true);
    });
  }, delay);
}

function setMode(mode) {
  state.mode = mode;
  els.modeMermaid.classList.toggle("active", mode === "Mermaid");
  els.modePlantUml.classList.toggle("active", mode === "PlantUML");
  els.builderHint.textContent = mode === "Mermaid"
    ? "Flowchart canvas syncs with Mermaid code."
    : "PlantUML is edited as source and rendered locally.";
  updateBuilderFromEditor();
  updateExportPanel();
  schedulePreview(150);
}

function sanitizeId(value) {
  const clean = value.replace(/[^a-zA-Z0-9_]/g, "").trim();
  if (!clean) return "Node";
  return /^[a-zA-Z]/.test(clean) ? clean : `Node${clean}`;
}

function uniqueNodeId(base) {
  const existing = new Set(state.graph.nodes.map((node) => node.id));
  let id = sanitizeId(base);
  let index = 2;
  while (existing.has(id)) {
    id = `${sanitizeId(base)}${index}`;
    index += 1;
  }
  return id;
}

function escapeLabel(label) {
  return label.replace(/"/g, "'");
}

function isFlowchartSource(source) {
  return /^\s*flowchart\s+/i.test(source);
}

function cleanLabel(value) {
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^\(\[/, "")
    .replace(/\]\)$/, "")
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .replace(/^"|"$/g, "")
    .trim();
}

function addNodeIfMissing(nodes, id, label) {
  if (!id) return;
  if (!nodes.has(id)) {
    nodes.set(id, {
      id,
      label: label || id,
      x: 80 + (nodes.size % 4) * 178,
      y: 70 + Math.floor(nodes.size / 4) * 120
    });
  }
  else if (label) {
    nodes.get(id).label = label;
  }
}

function parseMermaidFlowchart(source) {
  const nodes = new Map();
  const edges = [];
  const lines = source.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("flowchart") || line.startsWith("%%")) continue;

    const edgeMatch = line.match(/^([A-Za-z][\w-]*)[^\-]*-->\s*([A-Za-z][\w-]*)/);
    if (edgeMatch) {
      addNodeIfMissing(nodes, edgeMatch[1], edgeMatch[1]);
      addNodeIfMissing(nodes, edgeMatch[2], edgeMatch[2]);
      edges.push({ from: edgeMatch[1], to: edgeMatch[2] });
      continue;
    }

    const nodeMatch = line.match(/^([A-Za-z][\w-]*)\s*(\(\[[^\]]+\]\)|\[[^\]]+\]|\{[^}]+\})/);
    if (nodeMatch) {
      addNodeIfMissing(nodes, nodeMatch[1], cleanLabel(nodeMatch[2]));
    }
  }

  return { nodes: [...nodes.values()], edges };
}

function graphToMermaid(graph) {
  const lines = ["flowchart TD"];
  for (const node of graph.nodes) {
    lines.push(`    ${node.id}[${escapeLabel(node.label)}]`);
  }

  if (graph.edges.length > 0) {
    lines.push("");
  }

  for (const edge of graph.edges) {
    lines.push(`    ${edge.from} --> ${edge.to}`);
  }

  return `${lines.join("\n")}\n`;
}

function isPlantUmlClassSource(source) {
  return /@startuml/i.test(source) && /\bclass\s+[A-Za-z_][\w]*\s*\{/i.test(source);
}

function isPlantUmlSequenceSource(source) {
  return /@startuml/i.test(source) && /\b(actor|participant|boundary|control|entity|database)\s+/i.test(source) && /[-.]+[)>]/
    .test(source);
}

function isPlantUmlUseCaseSource(source) {
  return /@startuml/i.test(source) && (/\busecase\s+/i.test(source) || /\([^)]+\)/.test(source)) && /\bactor\s+/i.test(source);
}

function isMermaidSequenceSource(source) {
  return /^\s*sequenceDiagram\b/i.test(source);
}

function isMermaidClassSource(source) {
  return /^\s*classDiagram\b/i.test(source);
}

function addGenericNode(nodes, id, label, index) {
  const cleanId = sanitizeId(id || label || `Node${index + 1}`);
  if (nodes.has(cleanId)) return cleanId;
  nodes.set(cleanId, {
    id: cleanId,
    label: label || cleanId,
    x: 80 + (index % 4) * 230,
    y: 80 + Math.floor(index / 4) * 150
  });
  return cleanId;
}

function parseSourceMap(source) {
  const nodes = new Map();
  const edges = [];
  let index = 0;

  if (isPlantUmlUseCaseSource(source)) {
    for (const line of source.split(/\r?\n/).map((item) => item.trim())) {
      const actor = line.match(/^actor\s+("?)([^"]+)\1(?:\s+as\s+([A-Za-z_][\w]*))?/i);
      if (actor) {
        addGenericNode(nodes, actor[3] || actor[2], actor[2], index++);
        continue;
      }
      const useCase = line.match(/^\(([^)]+)\)(?:\s+as\s+([A-Za-z_][\w]*))?/i) || line.match(/^usecase\s+"([^"]+)"\s+as\s+([A-Za-z_][\w]*)/i);
      if (useCase) {
        addGenericNode(nodes, useCase[2] || useCase[1], useCase[1], index++);
        continue;
      }
      const relation = line.match(/^([A-Za-z_][\w]*)\s+[-.]+[->]+\s+([A-Za-z_][\w]*)(?:\s*:\s*(.+))?/);
      if (relation) {
        addGenericNode(nodes, relation[1], relation[1], index++);
        addGenericNode(nodes, relation[2], relation[2], index++);
        edges.push({ from: relation[1], to: relation[2], label: relation[3] || "", relation: "-->" });
      }
    }
  }
  else if (isPlantUmlSequenceSource(source) || isMermaidSequenceSource(source)) {
    for (const line of source.split(/\r?\n/).map((item) => item.trim())) {
      const participant = line.match(/^(actor|participant|boundary|control|entity|database)\s+("?)([^"]+)\2(?:\s+as\s+([A-Za-z_][\w]*))?/i) ||
        line.match(/^participant\s+([A-Za-z_][\w]*)\s+as\s+(.+)/i);
      if (participant) {
        addGenericNode(nodes, participant[4] || participant[3] || participant[1], participant[3] || participant[2], index++);
        continue;
      }
      const message = line.match(/^([A-Za-z_][\w]*)\s*[-.=]+[)>]+\s*([A-Za-z_][\w]*)(?:\s*:\s*(.+))?/);
      if (message) {
        addGenericNode(nodes, message[1], message[1], index++);
        addGenericNode(nodes, message[2], message[2], index++);
        edges.push({ from: message[1], to: message[2], label: message[3] || "", relation: "-->" });
      }
    }
  }
  else if (isMermaidClassSource(source)) {
    for (const line of source.split(/\r?\n/).map((item) => item.trim())) {
      const classLine = line.match(/^class\s+([A-Za-z_][\w]*)/i);
      const relation = line.match(/^([A-Za-z_][\w]*)\s+([<|o*.\-]+(?:>|--|\|)?|<\|--|-->|--)\s+([A-Za-z_][\w]*)(?:\s*:\s*(.+))?/);
      if (classLine) {
        addGenericNode(nodes, classLine[1], classLine[1], index++);
      }
      else if (relation) {
        addGenericNode(nodes, relation[1], relation[1], index++);
        addGenericNode(nodes, relation[3], relation[3], index++);
        edges.push({ from: relation[1], to: relation[3], relation: relation[2], label: relation[4] || "" });
      }
    }
  }

  return { nodes: [...nodes.values()], edges };
}

function parsePlantUmlClassDiagram(source) {
  const titleMatch = source.match(/^\s*title\s+(.+)$/im);
  const directionMatch = source.match(/^\s*(left to right direction|top to bottom direction)$/im);
  const nodes = new Map();
  const edges = [];
  let classIndex = 0;

  const classPattern = /class\s+([A-Za-z_][\w]*)\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = classPattern.exec(source)) !== null) {
    const id = match[1];
    const bodyLines = match[2]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const attributes = [];
    const methods = [];
    for (const line of bodyLines) {
      if (line.includes("(") && line.includes(")")) {
        methods.push(line);
      }
      else {
        attributes.push(line);
      }
    }

    nodes.set(id, {
      id,
      label: id,
      attributes,
      methods,
      x: 70 + (classIndex % 3) * 220,
      y: 60 + Math.floor(classIndex / 3) * 160
    });
    classIndex += 1;
  }

  const sourceWithoutBlocks = source.replace(classPattern, "");
  for (const rawLine of sourceWithoutBlocks.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("@") || line.startsWith("title") || line.endsWith("direction")) continue;

    const edgeMatch = line.match(/^([A-Za-z_][\w]*)(?:\s+"([^"]+)")?\s+([<|o*.\-]+(?:>|--|\|)?|<\|--|-->|--)\s+(?:"([^"]+)"\s+)?([A-Za-z_][\w]*)(?:\s*:\s*(.+))?$/);
    if (!edgeMatch) continue;

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
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#4cc9f0"></path>
      </marker>
      <marker id="inheritance" viewBox="0 0 12 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 10 5 L 1 1 L 1 9 Z" fill="rgba(7,8,14,0.95)" stroke="#4cc9f0" stroke-width="1.4"></path>
      </marker>
      <marker id="diamond" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 2 6 L 6 2 L 10 6 L 6 10 Z" fill="#4cc9f0"></path>
      </marker>
      <marker id="openDiamond" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 2 6 L 6 2 L 10 6 L 6 10 Z" fill="rgba(7,8,14,0.95)" stroke="#4cc9f0" stroke-width="1.4"></path>
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
    const markerEnd = relation.includes(">") ? "url(#arrow)" : "";
    const markerStart = relation.startsWith("<|") ? "url(#inheritance)" : relation.startsWith("*") ? "url(#diamond)" : relation.startsWith("o") ? "url(#openDiamond)" : "";

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", x1);
    hit.setAttribute("y1", y1);
    hit.setAttribute("x2", x2);
    hit.setAttribute("y2", y2);
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "18");
    hit.dataset.edgeIndex = String(index);
    hit.classList.add("edge-hit");
    els.edgeLayer.appendChild(hit);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", state.selectedEdgeIndex === index ? "#f72585" : "#4cc9f0");
    line.setAttribute("stroke-width", state.selectedEdgeIndex === index ? "3" : "2");
    line.setAttribute("stroke-opacity", "0.82");
    if (relation.includes("..")) {
      line.setAttribute("stroke-dasharray", "6 5");
    }
    if (markerStart) line.setAttribute("marker-start", markerStart);
    if (markerEnd) line.setAttribute("marker-end", markerEnd);
    line.classList.add("edge-line");
    if (state.selectedEdgeIndex === index) {
      line.classList.add("selected");
    }
    els.edgeLayer.appendChild(line);

    const normal = { x: offsetX * 1.5, y: offsetY * 1.5 };
    const unit = { x: dx / distance, y: dy / distance };
    appendEdgeText(edge.fromMultiplicity || "", x1 + unit.x * 46 + normal.x, y1 + unit.y * 46 + normal.y);
    appendEdgeText(edge.toMultiplicity || "", x2 - unit.x * 46 + normal.x, y2 - unit.y * 46 + normal.y);
    appendEdgeText(edge.label || "", (x1 + x2) / 2 + normal.x, (y1 + y2) / 2 + normal.y);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getEditableLines(editable) {
  if (!editable) return [];
  return editable.textContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function setEditableText(container, selector, value) {
  const editable = container.querySelector(selector);
  if (editable) editable.textContent = value;
}

function beginInlineEdit(node, field) {
  if (!state.inlineEdit || state.inlineEdit.nodeId !== node.id || state.inlineEdit.field !== field) {
    state.inlineEdit = {
      nodeId: node.id,
      field,
      snapshot: snapshotState()
    };
  }
  selectNode(node.id);
}

function finishInlineEdit() {
  if (!state.inlineEdit) return;
  const previous = state.inlineEdit.snapshot;
  state.inlineEdit = null;
  pushUndoSnapshot(previous);
  renderBuilder();
}

function cancelInlineEdit() {
  const edit = state.inlineEdit;
  if (!edit) return;
  state.inlineEdit = null;
  restoreSnapshot(edit.snapshot);
}

function updatePlantUmlNodeFromInline(node, nodeEl) {
  const title = nodeEl.querySelector('[data-field="name"]')?.textContent.trim() || node.label;
  const nextId = sanitizeId(title);
  const duplicate = state.graph.nodes.some((item) => item !== node && item.id === nextId);

  if (nextId && !duplicate && nextId !== node.id) {
    const previousId = node.id;
    node.id = nextId;
    node.label = nextId;
    nodeEl.dataset.id = nextId;
    state.selectedNodeId = nextId;
    if (state.inlineEdit?.nodeId === previousId) {
      state.inlineEdit.nodeId = nextId;
    }
    for (const edge of state.graph.edges) {
      if (edge.from === previousId) edge.from = nextId;
      if (edge.to === previousId) edge.to = nextId;
    }
  }
  else {
    node.label = node.id;
  }

  node.attributes = getEditableLines(nodeEl.querySelector('[data-field="attributes"]'));
  node.methods = getEditableLines(nodeEl.querySelector('[data-field="methods"]'));
  updateEditorFromGraph();
  showProperties();
  requestAnimationFrame(renderEdges);
}

function updateMermaidNodeFromInline(node, nodeEl) {
  const label = nodeEl.querySelector('[data-field="label"]')?.textContent.trim();
  if (!label) return;
  node.label = label;
  updateEditorFromGraph();
  showProperties();
  requestAnimationFrame(renderEdges);
}

function wireInlineEditors(nodeEl, node) {
  nodeEl.querySelectorAll(".inline-edit").forEach((editable) => {
    editable.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    editable.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    editable.addEventListener("dblclick", (event) => {
      event.stopPropagation();
    });
    editable.addEventListener("focus", () => {
      nodeEl.classList.add("editing");
      beginInlineEdit(node, editable.dataset.field);
    });
    editable.addEventListener("input", () => {
      if (state.builderType === "plantuml-class") {
        updatePlantUmlNodeFromInline(node, nodeEl);
      }
      else {
        updateMermaidNodeFromInline(node, nodeEl);
      }
    });
    editable.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelInlineEdit();
      }
      if (event.key === "Enter" && editable.dataset.field !== "attributes" && editable.dataset.field !== "methods") {
        event.preventDefault();
        editable.blur();
      }
    });
    editable.addEventListener("blur", () => {
      nodeEl.classList.remove("editing");
      window.setTimeout(() => {
        if (!nodeEl.contains(document.activeElement)) {
          finishInlineEdit();
        }
      }, 0);
    });
  });
}

function makeNodeElement(node) {
  const nodeEl = document.createElement("div");
  nodeEl.tabIndex = 0;
  nodeEl.setAttribute("role", "button");
  nodeEl.className = "diagram-node";
  nodeEl.dataset.id = node.id;
  if (state.builderType === "plantuml-class") {
    nodeEl.classList.add("class-node");
    nodeEl.innerHTML = `
      <span class="class-node-title inline-edit" data-field="name" contenteditable="true" spellcheck="false"></span>
      <span class="class-node-section inline-edit" data-field="attributes" contenteditable="true" spellcheck="false"></span>
      <span class="class-node-section inline-edit" data-field="methods" contenteditable="true" spellcheck="false"></span>
    `;
    setEditableText(nodeEl, '[data-field="name"]', node.label);
    setEditableText(nodeEl, '[data-field="attributes"]', (node.attributes || []).join("\n"));
    setEditableText(nodeEl, '[data-field="methods"]', (node.methods || []).join("\n"));
  }
  else {
    const editable = state.builderType === "mermaid-flowchart" ? ` class="node-label inline-edit" data-field="label" contenteditable="true" spellcheck="false"` : ` class="node-label"`;
    nodeEl.innerHTML = `<span${editable}></span>`;
    setEditableText(nodeEl, '[data-field="label"]', node.label);
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
  const enabled = state.builderType !== "none" && state.graph.nodes.length > 0;
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

  els.emptyBuilder.classList.toggle("hidden", enabled);
  els.addNode.disabled = state.isOrganizing || !enabled || !canEditStructure;
  els.connectNodes.disabled = state.isOrganizing || !enabled || !canEditStructure;
  if (els.deleteNode) els.deleteNode.disabled = state.isOrganizing || !enabled || !canEditStructure;

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
    (state.mode === "Mermaid" && (isMermaidSequenceSource(els.codeEditor.value) || isMermaidClassSource(els.codeEditor.value)))
  ) {
    state.builderType = "source-map";
    const previousPositions = new Map(state.graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const nextGraph = parseSourceMap(els.codeEditor.value);
    for (const node of nextGraph.nodes) {
      const previous = previousPositions.get(node.id);
      if (previous) {
        node.x = previous.x;
        node.y = previous.y;
      }
    }
    state.graph = nextGraph;
    els.emptyBuilder.textContent = "This diagram type is shown as a source-backed visual map. Edit the source or use Properties where available.";
    renderBuilder();
    return;
  }

  state.builderType = "none";
  if (state.mode === "PlantUML") {
    els.emptyBuilder.textContent = "Visual builder supports PlantUML class diagrams. Other PlantUML diagrams still render in Live Preview.";
  }
  else {
    els.emptyBuilder.textContent = "Visual builder is optimized for Mermaid flowcharts. Open or create a flowchart to edit nodes directly.";
  }
    state.graph = { nodes: [], edges: [] };
    renderBuilder();
}

function fileMatchesSearch(file, query) {
  if (!query) return true;
  return file.name.toLowerCase().includes(query) || fileDisplayPath(file).toLowerCase().includes(query);
}

function fileInitials(file) {
  return file.kind === "PlantUML" ? "PU" : "MM";
}

function setThumbnailFallback(target, file) {
  target.innerHTML = `<span class="file-thumb-empty">${fileInitials(file)}</span>`;
}

async function loadFileThumbnail(file, target) {
  if (!target.isConnected) return;
  const key = fileKey(file);
  const cached = state.thumbnailCache.get(key);
  if (cached) {
    target.innerHTML = cached;
    return;
  }

  try {
    const source = await api.workspace.readFile(file);
    const result = await api.preview.render(file.kind, source);
    if (!result?.ok || !result.svg) throw new Error(result?.error || "No preview SVG");

    const wrapper = document.createElement("div");
    wrapper.innerHTML = result.svg;
    const svg = wrapper.querySelector("svg");
    if (!svg) throw new Error("Preview did not contain SVG");

    const width = parseSvgNumber(svg.getAttribute("width") || "");
    const height = parseSvgNumber(svg.getAttribute("height") || "");
    if (!svg.getAttribute("viewBox") && width > 0 && height > 0) {
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "";
    svg.style.height = "";
    svg.style.background = "";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const html = svg.outerHTML;
    state.thumbnailCache.set(key, html);
    if (target.isConnected) target.innerHTML = html;
  }
  catch {
    if (target.isConnected) setThumbnailFallback(target, file);
  }
}

function queueFileThumbnail(file, target) {
  setThumbnailFallback(target, file);
  window.setTimeout(() => loadFileThumbnail(file, target), 0);
}

function makeFileItem(file) {
  const button = document.createElement("button");
  button.className = "file-item";
  button.type = "button";
  const isActive = fileKey(state.activeFile) === fileKey(file);
  button.classList.toggle("active", isActive);
  const dirtyMarker = isActive && state.isDirty
    ? '<span class="file-dirty" title="Unsaved changes"></span>'
    : "<span></span>";
  button.innerHTML = `
    <span class="file-thumb" aria-hidden="true"></span>
    <span class="file-meta">
      <span class="file-name"></span>
      <span class="file-kind"></span>
    </span>
    <span class="file-dot ${file.kind === "PlantUML" ? "plantuml" : ""}"></span>
    ${dirtyMarker}
  `;
  button.querySelector(".file-name").textContent = file.name;
  button.querySelector(".file-kind").textContent = file.kind;
  queueFileThumbnail(file, button.querySelector(".file-thumb"));
  button.addEventListener("click", () => openFile(file));
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showFileMenu(file, event.clientX, event.clientY);
  });
  return button;
}

function renderFileList() {
  const query = (els.fileSearch?.value || "").trim().toLowerCase();
  els.fileList.innerHTML = "";

  const groups = [
    { kind: "PlantUML", label: "PlantUML" },
    { kind: "Mermaid", label: "Mermaid" }
  ];

  let shown = 0;
  for (const group of groups) {
    const files = state.files.filter((file) => file.kind === group.kind && fileMatchesSearch(file, query));
    if (files.length === 0) continue;
    const details = document.createElement("details");
    details.className = "file-folder";
    details.open = Boolean(query);
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${group.label}</span><small>${files.length}</small>`;
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "file-folder-list";
    for (const file of files) {
      body.appendChild(makeFileItem(file));
      shown += 1;
    }
    details.appendChild(body);
    els.fileList.appendChild(details);
  }

  if (shown === 0) {
    const empty = document.createElement("div");
    empty.className = "file-empty";
    empty.textContent = query ? "No files match your search." : "No diagrams yet — use New to create one.";
    els.fileList.appendChild(empty);
  }

  renderRecent(query);
}

function renderRecent(query) {
  if (!els.recentList || !els.fileRecent) return;
  els.recentList.innerHTML = "";

  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem("phyto:recent") || "[]");
  }
  catch {
    recent = [];
  }

  const existing = new Map(state.files.map((file) => [fileKey(file), file]));
  const items = recent
    .map((file) => existing.get(fileKey(file)) || file)
    .filter((file) => fileKey(file))
    .filter((file) => fileKey(file) !== fileKey(state.activeFile))
    .filter((file) => fileMatchesSearch(file, query))
    .slice(0, 4);

  if (items.length === 0) {
    els.fileRecent.hidden = true;
    return;
  }

  els.fileRecent.hidden = false;
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

// Repaint the canvas node to reflect attribute/method edits once the user leaves
// the field — kept separate from typing so the textarea doesn't lose focus.
function commitNodeBodyEdits() {
  if (getSelectedNode() && state.builderType === "plantuml-class") {
    renderBuilder();
  }
}

function extractExportedNodePositions(svg) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return new Map();

  const positions = new Map();
  const nodeIds = new Set(state.graph.nodes.map((node) => node.id));
  const textNodes = [...doc.querySelectorAll("text")];

  for (const textNode of textNodes) {
    const label = textNode.textContent.trim();
    if (!nodeIds.has(label) || positions.has(label)) continue;

    let x = Number.parseFloat(textNode.getAttribute("x") || "NaN");
    let y = Number.parseFloat(textNode.getAttribute("y") || "NaN");

    let parent = textNode.parentElement;
    while (parent) {
      const transform = parent.getAttribute("transform") || "";
      const translate = transform.match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
      if (translate) {
        x += Number.parseFloat(translate[1]);
        y += Number.parseFloat(translate[2]);
      }
      parent = parent.parentElement;
    }

    if (Number.isFinite(x) && Number.isFinite(y)) {
      positions.set(label, { x, y });
    }
  }

  return positions;
}

async function organizeFromExport() {
  if (state.graph.nodes.length === 0 || state.isOrganizing) return;

  setOrganizing(true);
  appendConsole("Organizing layout...");
  try {
    const result = await api.preview.render(state.mode, els.codeEditor.value);
    if (!result.ok) {
      setPreviewStatus(result.error || "Preview failed.", true);
      appendConsole(result.error || "Preview failed.");
      return;
    }

    setPreviewSvg(result.svg);
    const positions = extractExportedNodePositions(result.svg);
    if (positions.size === 0) {
      appendConsole("Could not read class positions from exported SVG.");
      return;
    }

    const canvasRect = els.canvasViewport.getBoundingClientRect();
    const values = [...positions.values()];
    const minX = Math.min(...values.map((item) => item.x));
    const maxX = Math.max(...values.map((item) => item.x));
    const minY = Math.min(...values.map((item) => item.y));
    const maxY = Math.max(...values.map((item) => item.y));
    const rangeX = Math.max(maxX - minX, 1);
    const rangeY = Math.max(maxY - minY, 1);
    const margin = 56;
    const usableWidth = Math.max(canvasRect.width - margin * 2 - 220, 320);
    const usableHeight = Math.max(canvasRect.height - margin * 2 - 120, 260);
    const previous = snapshotState();

    for (const node of state.graph.nodes) {
      const position = positions.get(node.id);
      if (!position) continue;
      node.x = margin + ((position.x - minX) / rangeX) * usableWidth;
      node.y = margin + ((position.y - minY) / rangeY) * usableHeight;
    }

    state.canvasZoom = 1;
    state.canvasPan = { x: 0, y: 0 };
    pushUndoSnapshot(previous);
    renderBuilder();
    appendConsole("Organized builder from exported SVG layout.");
  }
  finally {
    setOrganizing(false);
  }
}

function autoLayoutGraph() {
  if (state.graph.nodes.length === 0 || state.isOrganizing) return;
  const previous = snapshotState();
  const columns = Math.max(2, Math.ceil(Math.sqrt(state.graph.nodes.length * 1.4)));
  state.graph.nodes.forEach((node, index) => {
    node.x = 80 + (index % columns) * 250;
    node.y = 80 + Math.floor(index / columns) * 170;
  });
  pushUndoSnapshot(previous);
  renderBuilder();
  fitCanvasToDiagram();
  appendConsole("Applied grid auto layout.");
}

function validateDiagram() {
  const issues = [];
  const ids = new Set();
  for (const node of state.graph.nodes) {
    if (ids.has(node.id)) issues.push(`Duplicate node/class id: ${node.id}`);
    ids.add(node.id);
    if (!node.label) issues.push(`Empty label on ${node.id}`);
  }
  for (const edge of state.graph.edges) {
    if (!ids.has(edge.from)) issues.push(`Relationship source is missing: ${edge.from}`);
    if (!ids.has(edge.to)) issues.push(`Relationship target is missing: ${edge.to}`);
    if (state.builderType === "plantuml-class" && !edge.relation) issues.push(`Relationship ${edge.from} -> ${edge.to} has no type.`);
  }
  if (state.mode === "PlantUML" && !/@enduml/i.test(els.codeEditor.value)) {
    issues.push("PlantUML source is missing @enduml.");
  }
  if (state.mode === "Mermaid" && !/^\s*(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/im.test(els.codeEditor.value)) {
    issues.push("Mermaid source does not start with a supported diagram keyword.");
  }

  if (issues.length === 0) {
    setConsole("Validation passed. No structural issues found.");
    showToast("Validation passed — no issues found.", "success");
    schedulePreview(0);
    return;
  }
  setSideView("console");
  setConsole(`Validation found ${issues.length} issue(s):\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  showToast(`Validation found ${issues.length} issue(s) — see Console.`, "error");
}

async function exportCurrentAs() {
  const baseName = (state.activeFile?.name || "diagram").replace(/\.(puml|mmd)$/i, "");
  const result = await api.export.current({
    kind: state.mode,
    content: els.codeEditor.value,
    format: els.exportFormat.value,
    background: els.exportBackground.value,
    baseName
  });

  if (result?.canceled) return;
  if (!result?.ok) {
    setSideView("console");
    setConsole(result?.error || "Export failed.");
    showToast(result?.error || "Export failed.", "error");
    return;
  }
  appendConsole(`Exported current diagram: ${result.path}`);
  showToast(`Exported to ${result.path}`, "success");
}

// Minimalist UML connector icons, shared by the popover and the context menu so
// relation types read at a glance instead of as "--", "<|--" text.
const REL_ICONS = {
  "--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="37" y2="8"/></svg>',
  "-->": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="34" y2="8"/><polyline points="27,3 36,8 27,13" fill="none"/></svg>',
  "<|--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="26" y2="8"/><polygon points="26,3 37,8 26,13" fill="none"/></svg>',
  "*--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="15" y1="8" x2="37" y2="8"/><polygon points="3,8 9,4 15,8 9,12" fill="currentColor"/></svg>',
  "o--": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="15" y1="8" x2="37" y2="8"/><polygon points="3,8 9,4 15,8 9,12" fill="none"/></svg>',
  "..>": '<svg class="rel-icon" viewBox="0 0 40 16" aria-hidden="true"><line x1="3" y1="8" x2="34" y2="8" stroke-dasharray="4 3"/><polyline points="27,3 36,8 27,13" fill="none"/></svg>'
};

const ICON_TRASH = '<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

function showContextMenu(x, y, kind) {
  const items = [];
  if (kind === "node") {
    items.push(["Edit Properties", () => setSideView("properties")]);
    items.push(["Duplicate", duplicateSelection]);
    items.push(["Start Relationship", () => els.connectNodes.click()]);
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
    return;
  }
  if (key === "0") {
    event.preventDefault();
    fitCanvasToDiagram();
    return;
  }
  if (key === "v" && event.shiftKey) {
    event.preventDefault();
    validateDiagram();
    return;
  }

  if (isSourceEditor || isInlineEditor) return;

  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    undoVisualChange();
  }
  else if (key === "y" || (key === "z" && event.shiftKey)) {
    event.preventDefault();
    redoVisualChange();
  }
});

const MENU_SHORTCUTS = [
  [els.menuNewFile, "Ctrl+N"],
  [els.menuOpenWorkspace, "Ctrl+O"],
  [els.menuSaveFile, "Ctrl+S"],
  [els.menuSaveAs, "Ctrl+Shift+S"],
  [els.menuExport, "Ctrl+E"],
  [els.menuUndo, "Ctrl+Z"],
  [els.menuRedo, "Ctrl+Shift+Z"],
  [els.menuDelete, "Del"],
  [els.menuCommandPalette, "Ctrl+Shift+P"],
  [els.menuFitCanvas, "Ctrl+0"],
  [els.menuValidate, "Ctrl+Shift+V"]
];

for (const [button, shortcut] of MENU_SHORTCUTS) {
  if (!button) continue;
  const label = button.textContent.trim();
  button.innerHTML = `<span class="menu-label">${escapeHtml(label)}</span><kbd>${escapeHtml(shortcut)}</kbd>`;
}

document.querySelectorAll(".menu-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const group = button.closest(".menu-group");
    if (!group) return;
    const wasOpen = group.classList.contains("open");
    closeMenus();
    if (!wasOpen) group.classList.add("open");
  });
});
document.querySelectorAll(".menu-popover").forEach((popover) => {
  popover.addEventListener("click", (event) => event.stopPropagation());
});

document.addEventListener("click", closeMenus);
document.addEventListener("click", () => {
  hideContextMenu();
  if (state.suppressNextDocumentClick) {
    state.suppressNextDocumentClick = false;
    return;
  }
  hideRelationshipPopover();
});

// "Build" closes panels and focuses the canvas; the others reveal a panel.
els.activityBuilder.addEventListener("click", () => {
  closeSidePanel();
});
for (const button of document.querySelectorAll(".activity-button[data-reveal]")) {
  button.addEventListener("click", () => revealSection(button.dataset.reveal));
}

els.sideOverlayBackdrop.addEventListener("click", () => closeSidePanel());
els.sidePanelClose.addEventListener("click", () => closeSidePanel());
els.sidePanel.addEventListener("click", (event) => event.stopPropagation());

els.consoleResizeHandle.addEventListener("pointerdown", (event) => {
  if (!els.workspace.classList.contains("console-panel-open")) return;
  event.preventDefault();
  const startY = event.clientY;
  const startHeight = state.consolePanelHeight;
  els.consoleResizeHandle.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    setConsolePanelHeight(startHeight + startY - moveEvent.clientY);
  };
  const onUp = () => {
    els.consoleResizeHandle.removeEventListener("pointermove", onMove);
    els.consoleResizeHandle.removeEventListener("pointerup", onUp);
  };

  els.consoleResizeHandle.addEventListener("pointermove", onMove);
  els.consoleResizeHandle.addEventListener("pointerup", onUp);
});

els.editorResizeHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const rect = els.editorGrid.getBoundingClientRect();
  els.editorGrid.classList.add("resizing");
  els.editorResizeHandle.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    const ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
    setEditorSplitRatio(ratio);
  };
  const onUp = () => {
    els.editorGrid.classList.remove("resizing");
    els.editorResizeHandle.removeEventListener("pointermove", onMove);
    els.editorResizeHandle.removeEventListener("pointerup", onUp);
  };

  els.editorResizeHandle.addEventListener("pointermove", onMove);
  els.editorResizeHandle.addEventListener("pointerup", onUp);
});

// Section headers expand/collapse; their action buttons must not also toggle.
for (const toggle of document.querySelectorAll(".side-section-toggle[data-toggle]")) {
  toggle.addEventListener("click", () => toggleSection(toggle.dataset.toggle));
}
for (const action of document.querySelectorAll(".side-section-actions")) {
  action.addEventListener("click", (event) => event.stopPropagation());
}

els.fileSearch.addEventListener("input", renderFileList);

els.menuBuilder.addEventListener("click", () => setSideView("builder"));
els.menuFiles.addEventListener("click", () => setSideView("files"));
els.menuPreview.addEventListener("click", () => setSideView("preview"));
els.menuProperties.addEventListener("click", () => setSideView("properties"));
els.menuConsole.addEventListener("click", () => setSideView("console"));
els.menuNewFile.addEventListener("click", createNewFile);
els.menuOpenWorkspace.addEventListener("click", openWorkspaceFolder);
els.menuSaveFile.addEventListener("click", saveActiveFile);
els.menuSaveAs.addEventListener("click", saveAsFile);
els.menuExport.addEventListener("click", exportCurrentAs);
els.menuExportAs.addEventListener("click", () => setSideView("export"));
els.menuOpenOutput.addEventListener("click", api.tools.openOutput);
els.menuRevealFile.addEventListener("click", () => api.workspace.revealFile(state.activeFile));
els.menuUndo.addEventListener("click", undoVisualChange);
els.menuRedo.addEventListener("click", redoVisualChange);
els.menuDuplicate.addEventListener("click", duplicateSelection);
els.menuDelete.addEventListener("click", deleteSelection);
els.menuCommandPalette.addEventListener("click", openCommandPalette);
els.menuFitCanvas.addEventListener("click", fitCanvasToDiagram);
els.menuZoomResetCanvas.addEventListener("click", resetCanvasZoom);
els.menuAddClass.addEventListener("click", () => els.addNode.click());
els.menuAddRelationship.addEventListener("click", () => els.connectNodes.click());
els.menuOrganize.addEventListener("click", () => organizeFromExport());
els.menuValidate.addEventListener("click", validateDiagram);
els.menuAutoLayout.addEventListener("click", autoLayoutGraph);
els.menuSettings?.addEventListener("click", openSettingsModal);
els.settingsClose?.addEventListener("click", closeSettingsModal);
els.settingsModal?.addEventListener("click", (event) => {
  if (event.target === els.settingsModal) closeSettingsModal();
});
els.settingsAutosave?.addEventListener("change", () => setAutosave(els.settingsAutosave.checked));
els.settingsTheme?.addEventListener("change", () => applyTheme(els.settingsTheme.value));

els.modeMermaid.addEventListener("click", () => {
  setMode("Mermaid");
  if (!state.activeFile) {
    els.codeEditor.value = templates.Mermaid;
    updateBuilderFromEditor();
  }
});

els.modePlantUml.addEventListener("click", () => {
  setMode("PlantUML");
  if (!state.activeFile) {
    els.codeEditor.value = templates.PlantUML;
    updateBuilderFromEditor();
  }
});

els.newFile.addEventListener("click", createNewFile);
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
  const initialFile = getLastWorkedFile()
    || state.files.find((file) => file.name === "flowchart.mmd")
    || state.files.find((file) => file.kind === "Mermaid");
  if (initialFile) {
    await openFile(initialFile);
  }
  else {
    updateBuilderFromEditor();
    setSideView("builder");
  }
}

start().catch((error) => {
  setConsole(error.message);
});
