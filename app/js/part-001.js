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
    fileExists: async () => true,
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
  plantUmlMeta: { title: "Class Diagram", orientation: "lr", lineType: "default", classCircle: true, attrIcons: true },
  renderOptions: { orientation: "tb", lineType: "default", classCircle: true, attrIcons: true },
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
