const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("phytoStudio", {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close")
  },
  workspace: {
    listFiles: () => ipcRenderer.invoke("workspace:list-files"),
    readFile: (relativePath) => ipcRenderer.invoke("workspace:read-file", relativePath),
    saveFile: (target, content) => ipcRenderer.invoke("workspace:save-file", target, content),
    saveFileAs: (options) => ipcRenderer.invoke("workspace:save-file-as", options),
    fileExists: (target) => ipcRenderer.invoke("workspace:file-exists", target),
    saveNewFile: (kind, fileName, content, overwrite) => ipcRenderer.invoke("workspace:save-new-file", kind, fileName, content, overwrite),
    chooseFolder: () => ipcRenderer.invoke("workspace:choose-folder"),
    openFile: () => ipcRenderer.invoke("workspace:open-file"),
    revealFile: (relativePath) => ipcRenderer.invoke("workspace:reveal-file", relativePath),
    renameFile: (relativePath, newName) => ipcRenderer.invoke("workspace:rename-file", relativePath, newName),
    duplicateFile: (relativePath) => ipcRenderer.invoke("workspace:duplicate-file", relativePath),
    deleteFile: (relativePath) => ipcRenderer.invoke("workspace:delete-file", relativePath)
  },
  tools: {
    check: () => ipcRenderer.invoke("tools:check"),
    renderPlantUml: () => ipcRenderer.invoke("tools:render-plantuml"),
    renderMermaid: () => ipcRenderer.invoke("tools:render-mermaid"),
    renderAll: () => ipcRenderer.invoke("tools:render-all"),
    openOutput: () => ipcRenderer.invoke("shell:open-output")
  },
  preview: {
    render: (kind, content) => ipcRenderer.invoke("preview:render", kind, content)
  },
  terminal: {
    create: () => ipcRenderer.invoke("terminal:create"),
    input: (id, data) => ipcRenderer.send("terminal:input", id, data),
    dispose: (id) => ipcRenderer.send("terminal:dispose", id),
    onData: (callback) => ipcRenderer.on("terminal:data", (_event, payload) => callback(payload)),
    onExit: (callback) => ipcRenderer.on("terminal:exit", (_event, payload) => callback(payload))
  },
  export: {
    current: (options) => ipcRenderer.invoke("export:current", options)
  },
  assets: {
    readText: (relativePath) => ipcRenderer.invoke("assets:read-text", relativePath)
  },
  dialogs: {
    newFileName: (kind) => ipcRenderer.invoke("dialog:new-file-name", kind)
  },
  app: {
    setDirty: (value) => ipcRenderer.send("app:dirty", value),
    onBeforeClose: (callback) => ipcRenderer.on("app:before-close", () => callback()),
    respondBeforeClose: (result) => ipcRenderer.send("app:before-close-result", result)
  }
});
