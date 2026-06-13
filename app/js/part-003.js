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
