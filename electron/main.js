const electron = require("electron");
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const launchLogDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "Phyto Studio");
const launchLogPath = path.join(launchLogDir, "launch.log");

function writeLaunchLog(message) {
  try {
    fsSync.mkdirSync(launchLogDir, { recursive: true });
    fsSync.appendFileSync(launchLogPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  }
  catch {
    // Logging must never prevent startup.
  }
}

writeLaunchLog(`Starting. execPath=${process.execPath}; argv=${JSON.stringify(process.argv)}; cwd=${process.cwd()}; ELECTRON_RUN_AS_NODE=${process.env.ELECTRON_RUN_AS_NODE || ""}`);

if (!electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  writeLaunchLog("Electron app API unavailable. Relaunching with ELECTRON_RUN_AS_NODE cleared.");
  spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: "ignore",
    env
  }).unref();

  process.exit(0);
}

const { app, BrowserWindow, ipcMain, dialog, shell } = electron;
app.setName("Phyto Studio");

const projectRoot = path.resolve(__dirname, "..");
let workspaceRoot = projectRoot;
let mainWindow = null;

// Tracks unsaved state reported by the renderer so we can guard window close.
let isDocumentDirty = false;
let forceClose = false;
let closeHandoffPending = false;

process.on("uncaughtException", (error) => {
  writeLaunchLog(`Uncaught exception: ${error.stack || error.message}`);
  console.error(error);
});

process.on("unhandledRejection", (error) => {
  writeLaunchLog(`Unhandled rejection: ${error.stack || error.message || error}`);
  console.error(error);
});

function createWindow() {
  writeLaunchLog(`Creating window. projectRoot=${projectRoot}`);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#07070c",
    title: "Phyto Studio",
    show: false,
    center: true,
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Guard against losing unsaved work when the window is closed.
  mainWindow.on("close", (event) => {
    if (forceClose || !isDocumentDirty) return;
    event.preventDefault();
    if (closeHandoffPending) return;

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "Unsaved changes",
      message: "Do you want to save the changes you made?",
      detail: "Your changes will be lost if you don't save them."
    });

    if (choice === 2) return; // Cancel — keep the window open.
    if (choice === 1) { // Don't Save — close immediately.
      forceClose = true;
      mainWindow.close();
      return;
    }

    // Save — let the renderer write the file, then close once it reports back.
    closeHandoffPending = true;
    mainWindow.webContents.send("app:before-close");
  });

  mainWindow.once("ready-to-show", () => {
    writeLaunchLog("Window ready to show.");
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    writeLaunchLog(`Window failed to load: ${errorCode} ${errorDescription}`);
  });

  mainWindow.loadFile(path.join(projectRoot, "app", "index.html")).catch((error) => {
    writeLaunchLog(`loadFile failed: ${error.stack || error.message}`);
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.local.phytostudio");
  writeLaunchLog("Electron app ready.");
  if (process.env.PHYTO_SELF_TEST_PREVIEW === "1") {
    runPreviewSelfTest();
    return;
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

async function runPreviewSelfTest() {
  try {
    const plantUmlSource = await fs.readFile(safeWorkspacePath(path.join("diagrams", "plantuml", "class-diagram.puml")), "utf8");
    const plantUmlSvg = await renderPlantUmlPreview(plantUmlSource);
    writeLaunchLog(`Self-test PlantUML preview SVG length=${plantUmlSvg.length}`);

    const mermaidSource = await fs.readFile(safeWorkspacePath(path.join("diagrams", "mermaid", "flowchart.mmd")), "utf8");
    const mermaidSvg = await renderMermaidPreview(mermaidSource);
    writeLaunchLog(`Self-test Mermaid preview SVG length=${mermaidSvg.length}`);
  }
  catch (error) {
    writeLaunchLog(`Self-test failed: ${error.stack || error.message}`);
    app.exit(1);
    return;
  }

  app.exit(0);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      windowsHide: true,
      env: options.env || process.env
    });

    let stdout = "";
    let stderr = "";
    let didTimeout = false;
    const timer = setTimeout(() => {
      didTimeout = true;
      child.kill();
    }, options.timeoutMs || 30000);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: didTimeout ? 124 : code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}

function findExecutableInDirectory(directory, executableName) {
  try {
    const candidate = path.join(directory, executableName);
    return fsSync.existsSync(candidate) ? candidate : null;
  }
  catch {
    return null;
  }
}

function findJavaCommand() {
  const javaFromHome = process.env.JAVA_HOME
    ? findExecutableInDirectory(path.join(process.env.JAVA_HOME, "bin"), "java.exe")
    : null;
  if (javaFromHome) return javaFromHome;

  const pathValue = process.env.PATH || process.env.Path || "";
  for (const entry of pathValue.split(path.delimiter)) {
    const candidate = findExecutableInDirectory(entry.replace(/^"|"$/g, ""), "java.exe");
    if (candidate) return candidate;
  }

  const roots = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Eclipse Adoptium"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Java"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Java")
  ];

  for (const root of roots) {
    if (!fsSync.existsSync(root)) continue;
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fsSync.readdirSync(current, { withFileTypes: true });
      }
      catch {
        continue;
      }

      const java = findExecutableInDirectory(path.join(current, "bin"), "java.exe");
      if (java) return java;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          stack.push(path.join(current, entry.name));
        }
      }
    }
  }

  return "java";
}

function findNodeCommand() {
  const pathValue = process.env.PATH || process.env.Path || "";
  for (const entry of pathValue.split(path.delimiter)) {
    const candidate = findExecutableInDirectory(entry.replace(/^"|"$/g, ""), "node.exe");
    if (candidate) return candidate;
  }

  const commonNode = findExecutableInDirectory(path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs"), "node.exe");
  return commonNode || "node";
}

function getFocusedWindow() {
  return BrowserWindow.getFocusedWindow();
}

ipcMain.handle("window:minimize", () => {
  getFocusedWindow()?.minimize();
});

ipcMain.handle("window:maximize", () => {
  const win = getFocusedWindow();
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

ipcMain.handle("window:close", () => {
  getFocusedWindow()?.close();
});

ipcMain.on("app:dirty", (_event, value) => {
  isDocumentDirty = Boolean(value);
});

ipcMain.on("app:before-close-result", (_event, result) => {
  closeHandoffPending = false;
  if (result === "cancel") return;
  // The renderer saved (or chose to discard) — proceed with the close.
  forceClose = true;
  mainWindow?.close();
});

function safeWorkspacePath(relativePath) {
  const resolved = path.resolve(workspaceRoot, relativePath);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error("Path is outside the workspace.");
  }
  return resolved;
}

function safeProjectPath(relativePath) {
  const resolved = path.resolve(projectRoot, relativePath);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error("Path is outside the application.");
  }
  return resolved;
}

async function ensureWorkspaceFolders() {
  await fs.mkdir(safeWorkspacePath(path.join("diagrams", "plantuml")), { recursive: true });
  await fs.mkdir(safeWorkspacePath(path.join("diagrams", "mermaid")), { recursive: true });
  await fs.mkdir(safeWorkspacePath("output"), { recursive: true });
}

async function listDiagramFiles() {
  await ensureWorkspaceFolders();
  const folders = [
    { kind: "PlantUML", folder: "diagrams/plantuml", extension: ".puml" },
    { kind: "Mermaid", folder: "diagrams/mermaid", extension: ".mmd" }
  ];

  const files = [];

  for (const item of folders) {
    const absoluteFolder = safeWorkspacePath(item.folder);
    let entries = [];
    try {
      entries = await fs.readdir(absoluteFolder, { withFileTypes: true });
    }
    catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(item.extension)) {
        const relativePath = path.posix.join(item.folder, entry.name);
        files.push({
          name: entry.name,
          kind: item.kind,
          relativePath
        });
      }
    }
  }

  return files;
}

ipcMain.handle("workspace:list-files", listDiagramFiles);

ipcMain.handle("workspace:read-file", async (_event, relativePath) => {
  const absolutePath = safeWorkspacePath(relativePath);
  return fs.readFile(absolutePath, "utf8");
});

ipcMain.handle("workspace:save-file", async (_event, relativePath, content) => {
  const absolutePath = safeWorkspacePath(relativePath);
  await fs.writeFile(absolutePath, content, "utf8");
  return { ok: true };
});

ipcMain.handle("workspace:save-new-file", async (_event, kind, fileName, content, overwrite) => {
  const cleanName = fileName.replace(/[<>:"/\\|?*]/g, "-").trim();
  if (!cleanName) {
    throw new Error("Enter a file name.");
  }

  const isPlantUml = kind === "PlantUML";
  const extension = isPlantUml ? ".puml" : ".mmd";
  const finalName = cleanName.endsWith(extension) ? cleanName : `${cleanName}${extension}`;
  const folder = isPlantUml ? "diagrams/plantuml" : "diagrams/mermaid";
  const relativePath = path.posix.join(folder, finalName);
  const absolutePath = safeWorkspacePath(relativePath);

  // "wx" fails if the file exists so the renderer can offer an overwrite prompt;
  // "w" is used only after the user explicitly confirms overwriting.
  await fs.writeFile(absolutePath, content, { encoding: "utf8", flag: overwrite ? "w" : "wx" });
  return { name: finalName, kind, relativePath };
});

ipcMain.handle("workspace:choose-folder", async () => {
  const result = await dialog.showOpenDialog(getFocusedWindow(), {
    title: "Open Phyto workspace",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) return null;

  workspaceRoot = result.filePaths[0];
  await ensureWorkspaceFolders();
  return { root: workspaceRoot };
});

ipcMain.handle("workspace:reveal-file", async (_event, relativePath) => {
  if (!relativePath) {
    await shell.openPath(workspaceRoot);
    return;
  }
  shell.showItemInFolder(safeWorkspacePath(relativePath));
});

function describeDiagramFile(relativePath) {
  const folder = path.posix.dirname(relativePath);
  const kind = folder.includes("plantuml") ? "PlantUML" : "Mermaid";
  return { name: path.posix.basename(relativePath), kind, relativePath };
}

ipcMain.handle("workspace:rename-file", async (_event, relativePath, newName) => {
  const folder = path.posix.dirname(relativePath);
  const extension = path.posix.extname(relativePath);
  const cleanName = String(newName).replace(/[<>:"/\\|?*]/g, "-").trim();
  if (!cleanName) {
    throw new Error("Enter a file name.");
  }
  const finalName = cleanName.endsWith(extension) ? cleanName : `${cleanName}${extension}`;
  const nextRelative = path.posix.join(folder, finalName);
  const source = safeWorkspacePath(relativePath);
  const target = safeWorkspacePath(nextRelative);

  if (fsSync.existsSync(target) && target !== source) {
    throw new Error(`"${finalName}" already exists.`);
  }
  await fs.rename(source, target);
  return describeDiagramFile(nextRelative);
});

ipcMain.handle("workspace:duplicate-file", async (_event, relativePath) => {
  const folder = path.posix.dirname(relativePath);
  const extension = path.posix.extname(relativePath);
  const base = path.posix.basename(relativePath, extension);
  const source = safeWorkspacePath(relativePath);

  let counter = 1;
  let candidate;
  let candidateRelative;
  do {
    const suffix = counter === 1 ? "-copy" : `-copy-${counter}`;
    candidateRelative = path.posix.join(folder, `${base}${suffix}${extension}`);
    candidate = safeWorkspacePath(candidateRelative);
    counter += 1;
  } while (fsSync.existsSync(candidate));

  await fs.copyFile(source, candidate);
  return describeDiagramFile(candidateRelative);
});

ipcMain.handle("workspace:delete-file", async (_event, relativePath) => {
  await fs.unlink(safeWorkspacePath(relativePath));
  return { ok: true };
});

function runPowerShellScript(scriptName) {
  return new Promise((resolve) => {
    const scriptPath = safeProjectPath(path.join("scripts", scriptName));
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath
    ], {
      cwd: workspaceRoot,
      windowsHide: true
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

function findMermaidCommand() {
  const packageCli = path.join(projectRoot, "node_modules", "@mermaid-js", "mermaid-cli", "src", "cli.js");
  if (fsSync.existsSync(packageCli)) {
    return { command: findNodeCommand(), prefixArgs: [packageCli] };
  }

  const localCmd = path.join(projectRoot, "node_modules", ".bin", "mmdc.cmd");
  if (fsSync.existsSync(localCmd)) {
    return { command: localCmd, prefixArgs: [] };
  }

  return { command: "mmdc", prefixArgs: [] };
}

async function renderPlantUmlPreview(content) {
  const plantUmlJar = safeProjectPath(path.join("tools", "plantuml.jar"));
  if (!fsSync.existsSync(plantUmlJar)) {
    throw new Error("PlantUML jar is missing at tools\\plantuml.jar");
  }

  const previewDir = path.join(app.getPath("userData"), "preview", "plantuml");
  await fs.mkdir(previewDir, { recursive: true });

  const inputPath = path.join(previewDir, "preview.puml");
  const outputPath = path.join(previewDir, "preview.svg");
  await fs.writeFile(inputPath, content, "utf8");

  const graphvizDot = "C:\\Program Files\\Graphviz\\bin\\dot.exe";
  const env = { ...process.env };
  if (!env.GRAPHVIZ_DOT && fsSync.existsSync(graphvizDot)) {
    env.GRAPHVIZ_DOT = graphvizDot;
    const graphvizBin = path.dirname(graphvizDot);
    const existingPath = env.Path || env.PATH || "";
    env.PATH = `${graphvizBin};${existingPath}`;
    env.Path = env.PATH;
  }

  const javaCommand = findJavaCommand();
  writeLaunchLog(`PlantUML preview using Java command: ${javaCommand}`);
  const result = await runCommand(javaCommand, ["-jar", plantUmlJar, "-tsvg", "-o", previewDir, inputPath], { env });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "PlantUML preview failed.").trim());
  }

  return fs.readFile(outputPath, "utf8");
}

async function renderMermaidPreview(content) {
  const previewDir = path.join(app.getPath("userData"), "preview", "mermaid");
  await fs.mkdir(previewDir, { recursive: true });

  const inputPath = path.join(previewDir, "preview.mmd");
  const outputPath = path.join(previewDir, "preview.svg");
  const mermaidConfig = safeProjectPath(path.join("config", "mermaid-config.json"));
  await fs.writeFile(inputPath, content, "utf8");

  const mermaid = findMermaidCommand();
  const args = [
    ...mermaid.prefixArgs,
    "-i",
    inputPath,
    "-o",
    outputPath,
    "-b",
    "transparent",
    "--quiet"
  ];

  if (fsSync.existsSync(mermaidConfig)) {
    args.push("-c", mermaidConfig);
  }

  const result = await runCommand(mermaid.command, args, { timeoutMs: 45000 });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "Mermaid preview failed.").trim());
  }

  return fs.readFile(outputPath, "utf8");
}

ipcMain.handle("tools:check", () => runPowerShellScript("check-tools.ps1"));
ipcMain.handle("tools:render-plantuml", () => runPowerShellScript("render-plantuml.ps1"));
ipcMain.handle("tools:render-mermaid", () => runPowerShellScript("render-mermaid.ps1"));
ipcMain.handle("tools:render-all", () => runPowerShellScript("render-all.ps1"));

async function renderPlantUmlFile(content, format, outputPath) {
  const plantUmlJar = safeProjectPath(path.join("tools", "plantuml.jar"));
  if (!fsSync.existsSync(plantUmlJar)) {
    throw new Error("PlantUML jar is missing at tools\\plantuml.jar");
  }

  const exportDir = path.join(app.getPath("userData"), "export", "plantuml");
  await fs.mkdir(exportDir, { recursive: true });
  const inputPath = path.join(exportDir, "current.puml");
  await fs.writeFile(inputPath, content, "utf8");

  const graphvizDot = "C:\\Program Files\\Graphviz\\bin\\dot.exe";
  const env = { ...process.env };
  if (!env.GRAPHVIZ_DOT && fsSync.existsSync(graphvizDot)) {
    env.GRAPHVIZ_DOT = graphvizDot;
    const graphvizBin = path.dirname(graphvizDot);
    const existingPath = env.Path || env.PATH || "";
    env.PATH = `${graphvizBin};${existingPath}`;
    env.Path = env.PATH;
  }

  const result = await runCommand(findJavaCommand(), ["-jar", plantUmlJar, `-t${format}`, "-o", exportDir, inputPath], { env, timeoutMs: 60000 });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "PlantUML export failed.").trim());
  }

  const rendered = path.join(exportDir, `current.${format}`);
  await fs.copyFile(rendered, outputPath);
}

async function renderMermaidFile(content, format, outputPath, background) {
  const exportDir = path.join(app.getPath("userData"), "export", "mermaid");
  await fs.mkdir(exportDir, { recursive: true });
  const inputPath = path.join(exportDir, "current.mmd");
  await fs.writeFile(inputPath, content, "utf8");

  const mermaidConfig = safeProjectPath(path.join("config", "mermaid-config.json"));
  const mermaid = findMermaidCommand();
  const args = [
    ...mermaid.prefixArgs,
    "-i",
    inputPath,
    "-o",
    outputPath,
    "-b",
    background || "transparent",
    "--quiet"
  ];

  if (fsSync.existsSync(mermaidConfig)) {
    args.push("-c", mermaidConfig);
  }

  const result = await runCommand(mermaid.command, args, { timeoutMs: 60000 });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "Mermaid export failed.").trim());
  }
}

ipcMain.handle("export:current", async (_event, options) => {
  try {
    const kind = options?.kind === "PlantUML" ? "PlantUML" : "Mermaid";
    const requestedFormat = String(options?.format || "svg").toLowerCase();
    const format = ["svg", "png", "pdf"].includes(requestedFormat) ? requestedFormat : "svg";
    const defaultName = `${options?.baseName || "diagram"}.${format}`;
    const saveResult = await dialog.showSaveDialog(getFocusedWindow(), {
      title: `Export ${kind}`,
      defaultPath: path.join(workspaceRoot, "output", defaultName),
      filters: [
        { name: `${format.toUpperCase()} file`, extensions: [format] },
        { name: "All files", extensions: ["*"] }
      ]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: false, canceled: true };
    }

    if (kind === "PlantUML") {
      await renderPlantUmlFile(options.content || "", format, saveResult.filePath);
    }
    else {
      await renderMermaidFile(options.content || "", format, saveResult.filePath, options.background);
    }

    return { ok: true, path: saveResult.filePath };
  }
  catch (error) {
    writeLaunchLog(`Export failed: ${error.stack || error.message}`);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("preview:render", async (_event, kind, content) => {
  try {
    const svg = kind === "PlantUML"
      ? await renderPlantUmlPreview(content)
      : await renderMermaidPreview(content);
    return { ok: true, svg };
  }
  catch (error) {
    writeLaunchLog(`Preview render failed: ${error.stack || error.message}`);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("shell:open-output", async () => {
  await shell.openPath(safeWorkspacePath("output"));
});

ipcMain.handle("dialog:new-file-name", async (_event, kind) => {
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Create default", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: `New ${kind} diagram`,
    message: `Create a new ${kind} diagram from the current editor content?`,
    detail: "The app will create a timestamped file in the correct diagrams folder."
  });

  if (result.response === 1) {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return kind === "PlantUML" ? `diagram-${stamp}.puml` : `diagram-${stamp}.mmd`;
});
