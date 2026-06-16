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
  setCodePanelHidden(localStorage.getItem("phyto:codeHidden") === "true");
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

// --- Integrated terminal dock (VS Code-style) ----------------------------
// "Output" is the persistent app log (render errors, saves). The "+" button
// spawns real PowerShell terminals that run ordinary commands. Each terminal
// keeps its own session, scrollback and command history.
(function setupTerminalDock() {
  const tabsEl = document.getElementById("terminalTabs");
  const viewsEl = document.getElementById("terminalViews");
  const addBtn = document.getElementById("terminalAdd");
  const inputRow = document.getElementById("terminalInputRow");
  const input = document.getElementById("terminalInput");
  const outputView = document.getElementById("consoleOutput");
  const outputTab = tabsEl?.querySelector('[data-term="output"]');
  if (!tabsEl || !viewsEl || !input) return;

  const terms = new Map();
  let activeId = "output";
  let seq = 0;

  const consoleVisible = () => Boolean(els.workspace?.classList.contains("console-panel-open"));

  function setActive(id) {
    activeId = id;
    outputTab?.classList.toggle("active", id === "output");
    outputView.classList.toggle("active", id === "output");
    for (const [termId, term] of terms) {
      const on = termId === id;
      term.tabEl.classList.toggle("active", on);
      term.viewEl.classList.toggle("active", on);
    }
    inputRow.hidden = id === "output";
    if (id !== "output") requestAnimationFrame(() => input.focus());
  }

  function appendTo(view, text) {
    const atBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 8;
    view.textContent += text;
    if (atBottom) view.scrollTop = view.scrollHeight;
  }

  function closeTerm(id) {
    const term = terms.get(id);
    if (!term) return;
    api.terminal?.dispose?.(id);
    term.tabEl.remove();
    term.viewEl.remove();
    terms.delete(id);
    if (activeId === id) {
      const next = [...terms.keys()].pop();
      setActive(next || "output");
    }
  }

  function makeTab(id, label) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "terminal-tab";
    tab.dataset.term = id;
    const name = document.createElement("span");
    name.textContent = label;
    tab.appendChild(name);
    const close = document.createElement("span");
    close.className = "terminal-tab-close";
    close.textContent = "×";
    close.title = "Close terminal";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTerm(id);
    });
    tab.appendChild(close);
    tab.addEventListener("click", () => setActive(id));
    return tab;
  }

  async function newTerminal() {
    if (!api.terminal?.create) {
      appendConsole("Terminal is only available in the desktop app.");
      return;
    }
    let result;
    try {
      result = await api.terminal.create();
    }
    catch (error) {
      appendConsole(`Terminal failed to start: ${error.message}`);
      return;
    }
    seq += 1;
    const id = result.id;
    const view = document.createElement("pre");
    view.className = "terminal-view";
    view.dataset.termView = id;
    viewsEl.appendChild(view);
    const tab = makeTab(id, `pwsh ${seq}`);
    tabsEl.appendChild(tab);
    terms.set(id, { tabEl: tab, viewEl: view, history: [], historyIndex: 0, alive: true });
    setActive(id);
  }

  window.focusActiveTerminal = () => {
    if (activeId !== "output") requestAnimationFrame(() => input.focus());
  };
  window.clearActiveTerminal = () => {
    const term = terms.get(activeId);
    if (!term) return false;
    term.viewEl.textContent = "";
    return true;
  };

  outputTab?.addEventListener("click", () => setActive("output"));
  addBtn?.addEventListener("click", newTerminal);

  input.addEventListener("keydown", (event) => {
    const term = terms.get(activeId);
    if (!term) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const line = input.value;
      appendTo(term.viewEl, `PS> ${line}\n`);
      if (line.trim()) {
        term.history.push(line);
        term.historyIndex = term.history.length;
      }
      api.terminal.input(activeId, `${line}\r\n`);
      input.value = "";
    }
    else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (term.historyIndex > 0) {
        term.historyIndex -= 1;
        input.value = term.history[term.historyIndex] || "";
      }
    }
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (term.historyIndex < term.history.length - 1) {
        term.historyIndex += 1;
        input.value = term.history[term.historyIndex] || "";
      }
      else {
        term.historyIndex = term.history.length;
        input.value = "";
      }
    }
  });

  api.terminal?.onData?.(({ id, chunk }) => {
    const term = terms.get(id);
    if (!term) return;
    appendTo(term.viewEl, chunk);
    if (!(consoleVisible() && activeId === id)) bumpConsoleBadge();
  });
  api.terminal?.onExit?.(({ id, code }) => {
    const term = terms.get(id);
    if (!term) return;
    term.alive = false;
    appendTo(term.viewEl, `\n[process exited with code ${code}]\n`);
  });
})();
