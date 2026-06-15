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

  // Any diagram the node-editor can't represent (object, component, state,
  // activity, gantt, mindmap, ER, json, archimate, ...) is shown as a fully
  // rendered local SVG on the builder canvas, so every diagram type is visual.
  state.builderType = "preview";
  state.graph = { nodes: [], edges: [] };
  if (els.builderPreview && !els.builderPreview.querySelector("svg")) {
    setBuilderPreviewStatus("Rendering visual preview...");
  }
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
    if (api.workspace.fileExists && !(await api.workspace.fileExists(file))) {
      setThumbnailFallback(target, file);
      return;
    }
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
