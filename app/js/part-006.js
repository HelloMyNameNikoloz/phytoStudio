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

