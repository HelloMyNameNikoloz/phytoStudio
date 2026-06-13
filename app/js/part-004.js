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
