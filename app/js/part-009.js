    hit.setAttribute("stroke-width", "18");
    hit.dataset.edgeIndex = String(index);
    hit.classList.add("edge-hit");
    els.edgeLayer.appendChild(hit);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    if (relation.includes("..")) {
      line.setAttribute("stroke-dasharray", "6 5");
    }
    if (markerStart) line.setAttribute("marker-start", markerStart);
    if (markerEnd) line.setAttribute("marker-end", markerEnd);
    line.classList.add("edge-line");
    if (isSelected) {
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

// Stick-figure glyph drawn above an actor's label on the builder canvas.
const ACTOR_GLYPH = `<svg class="actor-glyph" viewBox="0 0 24 42" aria-hidden="true"><circle cx="12" cy="6" r="5"/><line x1="12" y1="11" x2="12" y2="27"/><line x1="3" y1="17" x2="21" y2="17"/><line x1="12" y1="27" x2="4" y2="40"/><line x1="12" y1="27" x2="20" y2="40"/></svg>`;

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
    // The visual editor and Mermaid flowchart both edit labels in place.
    const labelEditable = state.builderType === "mermaid-flowchart" || state.builderType === "plantuml-visual";
    const editable = labelEditable ? ` class="node-label inline-edit" data-field="label" contenteditable="true" spellcheck="false"` : ` class="node-label"`;
    // Shaped diagrams (visual editor + read-only source maps) carry a shape so
    // actors render as stick figures, databases as cylinders, use cases as ovals,
    // etc. — matching the PlantUML output instead of every element being a box.
    const shaped = state.builderType === "source-map" || state.builderType === "plantuml-visual";
    const shape = shaped ? (node.shape || "rectangle") : "rectangle";
    let decoration = "";
    if (shape === "actor") {
      nodeEl.classList.add("actor-node");
      decoration = ACTOR_GLYPH;
    }
    else if (shape === "database") {
      nodeEl.classList.add("database-node");
    }
    else if (shape === "usecase") {
      nodeEl.classList.add("usecase-node");
    }
    else if (shape === "component") {
      nodeEl.classList.add("component-node");
    }
    else if (shape === "class") {
      nodeEl.classList.add("class-figure-node");
    }
    nodeEl.innerHTML = `${decoration}<span${editable}></span>`;
    setEditableText(nodeEl, '[data-field="label"]', node.label);
