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
