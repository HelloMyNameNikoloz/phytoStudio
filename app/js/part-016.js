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
  [els.menuOpenFile, "Ctrl+O"],
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

// "Build" closes panels and focuses the canvas; the others toggle their panel
// so pressing the active section again collapses it back.
els.activityBuilder.addEventListener("click", () => {
  closeSidePanel();
});
for (const button of document.querySelectorAll(".activity-button[data-reveal]")) {
  button.addEventListener("click", () => toggleSection(button.dataset.reveal));
}

// Figures palette: click to drop a figure at the canvas center, or drag a tile
// onto the canvas to place it exactly where released.
for (const tile of document.querySelectorAll(".figure-tile")) {
  tile.addEventListener("click", () => addFigure(tile.dataset.figure));
  tile.addEventListener("dragstart", (event) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData("text/phyto-figure", tile.dataset.figure);
    event.dataTransfer.effectAllowed = "copy";
    tile.classList.add("dragging");
  });
  tile.addEventListener("dragend", () => tile.classList.remove("dragging"));
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
els.menuOpenFile.addEventListener("click", openFileFromDialog);
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

els.toggleCodePanel?.addEventListener("click", () => setCodePanelHidden(!state.codePanelHidden));

els.promptOk?.addEventListener("click", () => resolvePrompt(els.promptInput.value));
els.promptCancel?.addEventListener("click", () => resolvePrompt(null));
els.promptModal?.addEventListener("click", (event) => {
  if (event.target === els.promptModal) resolvePrompt(null);
});
els.promptInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    resolvePrompt(els.promptInput.value);
  }
  else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    resolvePrompt(null);
  }
});

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

els.optOrientation?.addEventListener("change", () => setRenderOption("orientation", els.optOrientation.value));
els.optLineType?.addEventListener("change", () => setRenderOption("lineType", els.optLineType.value));
els.optClassCircle?.addEventListener("click", () => setRenderOption("classCircle", !state.renderOptions.classCircle));
els.optAttrIcons?.addEventListener("click", () => setRenderOption("attrIcons", !state.renderOptions.attrIcons));

els.newFile.addEventListener("click", createNewFile);
