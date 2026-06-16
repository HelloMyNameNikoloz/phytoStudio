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

// Maps PlantUML element keywords to the visual shape the builder should draw.
// Anything not listed falls back to a plain box.
const PLANTUML_SHAPE_BY_KEYWORD = {
  actor: "actor",
  person: "actor",
  usecase: "usecase",
  interface: "usecase",
  database: "database",
  storage: "database",
  rectangle: "rectangle",
  node: "rectangle",
  component: "component",
  boundary: "rectangle",
  control: "rectangle",
  entity: "rectangle",
  collections: "rectangle",
  queue: "rectangle",
  participant: "rectangle",
  class: "class"
};

// Canonical shape -> PlantUML keyword used when regenerating the source from the
// visual canvas.
const VISUAL_KEYWORD_BY_SHAPE = {
  actor: "actor",
  usecase: "usecase",
  database: "database",
  rectangle: "rectangle",
  component: "component",
  class: "class"
};

// PlantUML labels embed "\n" for line breaks; collapse them so the builder shows
// a clean single-line caption.
function normalizeNodeLabel(label) {
  return String(label || "").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
}

function addGenericNode(nodes, id, label, index, shape) {
  const cleanId = sanitizeId(id || label || `Node${index + 1}`);
  const existing = nodes.get(cleanId);
  if (existing) {
    // A later declaration (e.g. "database X") can refine a shape that was only
    // inferred from a relationship, but never downgrade an explicit shape.
    if (shape && shape !== "rectangle" && (!existing.shape || existing.shape === "rectangle")) {
      existing.shape = shape;
    }
    return cleanId;
  }
  nodes.set(cleanId, {
    id: cleanId,
    label: label || cleanId,
    shape: shape || "rectangle",
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
    const declKeywords = Object.keys(PLANTUML_SHAPE_BY_KEYWORD).join("|");
    const declPattern = new RegExp(`^(${declKeywords})\\b\\s*(?:"([^"]*)"|([A-Za-z_][\\w]*))?(?:\\s+as\\s+([A-Za-z_][\\w]*))?`, "i");
    for (const line of source.split(/\r?\n/).map((item) => item.trim())) {
      // Element declarations such as: actor "Label" as Alias / database X / rectangle "Y".
      const decl = line.match(declPattern);
      if (decl) {
        const keyword = decl[1].toLowerCase();
        const quoted = decl[2];
        const bare = decl[3];
        const alias = decl[4];
        const label = normalizeNodeLabel(quoted || bare || alias || keyword);
        addGenericNode(nodes, alias || bare || label, label, index++, PLANTUML_SHAPE_BY_KEYWORD[keyword]);
        continue;
      }
      // Anonymous use cases written as ( ... ) render as ovals.
      const useCase = line.match(/^\(([^)]+)\)(?:\s+as\s+([A-Za-z_][\w]*))?/i);
      if (useCase) {
        addGenericNode(nodes, useCase[2] || useCase[1], normalizeNodeLabel(useCase[1]), index++, "usecase");
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
        const keyword = (participant[1] || "participant").toLowerCase();
        addGenericNode(nodes, participant[4] || participant[3] || participant[1], normalizeNodeLabel(participant[3] || participant[2]), index++, PLANTUML_SHAPE_BY_KEYWORD[keyword]);
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

// ---- PlantUML visual editor (fully editable, two-way synced) ----
// Use-case / component-style diagrams (actors, use cases, rectangles, databases,
// components, simple class boxes joined by arrows) are edited directly on the
// canvas. The source is regenerated from the graph, so it carries a marker plus
// "' phyto-pos" comments that round-trip node positions.

function isPlantUmlVisualSource(source) {
  if (!/@startuml/i.test(source)) return false;
  if (/^\s*'\s*phyto:visual\b/im.test(source)) return true;
  const hasStructuralShape = /^\s*(usecase|rectangle|database|component|node|storage|boundary|control|entity|collections|queue)\b/im.test(source)
    || /^\s*\([^)]+\)/m.test(source);
  const hasActor = /^\s*(actor|person)\b/im.test(source);
  // A plain sequence diagram (actors/participants + messages, no structural
  // shapes) stays read-only; only use-case/component layouts are editable here.
  if (isPlantUmlSequenceSource(source) && !hasStructuralShape) return false;
  return hasStructuralShape || hasActor;
}

function parsePlantUmlVisual(source) {
  const nodes = new Map();
  const edges = [];
  const positions = new Map();
  let index = 0;
  const declKeywords = Object.keys(PLANTUML_SHAPE_BY_KEYWORD).join("|");
  const declPattern = new RegExp(`^(${declKeywords})\\b\\s*(?:"([^"]*)"|([A-Za-z_][\\w]*))?(?:\\s+as\\s+([A-Za-z_][\\w]*))?`, "i");

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const pos = line.match(/^'\s*phyto-pos\s+([A-Za-z_]\w*)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
    if (pos) {
      positions.set(pos[1], { x: Number(pos[2]), y: Number(pos[3]) });
      continue;
    }
    if (!line || line.startsWith("'") || line.startsWith("@")) continue;
    if (/(left to right|top to bottom)\s+direction/i.test(line) || /^skinparam\b/i.test(line)
      || /^title\b/i.test(line) || /^hide\b/i.test(line)) continue;

    const decl = line.match(declPattern);
    if (decl) {
      const keyword = decl[1].toLowerCase();
      const label = normalizeNodeLabel(decl[2] || decl[3] || decl[4] || keyword);
      addGenericNode(nodes, decl[4] || decl[3] || label, label, index++, PLANTUML_SHAPE_BY_KEYWORD[keyword]);
      continue;
    }
    const anon = line.match(/^\(([^)]+)\)(?:\s+as\s+([A-Za-z_]\w*))?/i);
    if (anon) {
      addGenericNode(nodes, anon[2] || anon[1], normalizeNodeLabel(anon[1]), index++, "usecase");
      continue;
    }
    const rel = line.match(/^([A-Za-z_]\w*)\s+(\S+)\s+([A-Za-z_]\w*)\s*(?::\s*(.+))?$/);
    if (rel && /^[<>|o*.=\-]+$/.test(rel[2]) && /[-.]/.test(rel[2])) {
      addGenericNode(nodes, rel[1], rel[1], index++);
      addGenericNode(nodes, rel[3], rel[3], index++);
      edges.push({ from: rel[1], to: rel[3], relation: rel[2], label: (rel[4] || "").trim() });
    }
  }

  for (const node of nodes.values()) {
    const stored = positions.get(node.id);
    if (stored) {
      node.x = stored.x;
      node.y = stored.y;
    }
  }

  return { graph: { nodes: [...nodes.values()], edges }, meta: readRenderOptionsFromSource(source) };
}

function graphToPlantUmlVisual(graph, meta) {
  const orientation = (meta?.orientation || "lr") === "tb" ? "top to bottom direction" : "left to right direction";
  const lines = ["@startuml", "' phyto:visual", orientation];
  if (meta?.lineType && meta.lineType !== "default") lines.push(`skinparam linetype ${meta.lineType}`);
  lines.push("");

  for (const node of graph.nodes) {
    lines.push(`' phyto-pos ${node.id} ${Math.round(node.x || 0)} ${Math.round(node.y || 0)}`);
  }
  if (graph.nodes.length > 0) lines.push("");

  for (const node of graph.nodes) {
    const keyword = VISUAL_KEYWORD_BY_SHAPE[node.shape] || "rectangle";
    lines.push(`${keyword} "${escapeLabel(node.label || node.id)}" as ${node.id}`);
  }
  if (graph.edges.length > 0) lines.push("");

  for (const edge of graph.edges) {
    const label = edge.label ? ` : ${edge.label}` : "";
    lines.push(`${edge.from} ${edge.relation || "-->"} ${edge.to}${label}`);
  }

  lines.push("");
  lines.push("@enduml");
  return `${lines.join("\n")}\n`;
}

function parsePlantUmlClassDiagram(source) {
  const titleMatch = source.match(/^\s*title\s+(.+)$/im);
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
