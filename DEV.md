# Phyto Studio Entwicklerdoku

Diese Datei beschreibt die App-Struktur, den Datenfluss und die wichtigsten Implementierungsentscheidungen.

## Ziel der App

Phyto Studio ist ein lokaler Diagramm-Workspace fuer PlantUML und Mermaid. Nutzer bearbeiten Quelltext, sehen eine lokal gerenderte SVG-Vorschau, koennen einfache Diagramme visuell bauen und exportieren nur das aktuell aktive Diagramm als SVG, PNG oder PDF.

## Projektstruktur

```text
phyto_studio/
├── app/
│   ├── index.html      # feste UI-Struktur
│   ├── renderer.js     # gesamte Renderer-Logik
│   └── styles.css      # Themes, Layout und Komponenten
├── electron/
│   ├── main.js         # Electron Main Process, IPC, Datei- und Renderzugriff
│   └── preload.js      # sichere API-Bruecke fuer den Renderer
├── diagrams/
│   ├── mermaid/        # versionierbare .mmd Quelldateien
│   └── plantuml/       # versionierbare .puml Quelldateien
├── scripts/            # PowerShell-Helfer fuer Tools, Rendering und Build
├── tools/              # lokale Tools, vor allem plantuml.jar
├── config/             # Mermaid-Konfiguration
├── output/             # generierte Render-Ausgaben, ignoriert von Git
└── dist/               # Electron-Build, ignoriert von Git
```

## Start und Build

`npm start` startet Electron direkt aus dem Projektordner. `npm run build:win` baut den Windows-Installer und danach mit `scripts\build-launcher.ps1` einen No-Install-Launcher unter `dist\Phyto Studio.exe`.

Wichtige Scripts:

```powershell
npm start
npm run check-tools
npm run render:plantuml
npm run render:mermaid
npm run render:all
npm run build:win
```

## Electron-Aufbau

`electron/main.js` erzeugt ein frameless BrowserWindow und laedt `app/index.html`. Der Main Process hat Zugriff auf Dateisystem, Shell, Dialoge und lokale Render-Tools.

`electron/preload.js` stellt dem Renderer unter `window.phytoStudio` nur die erlaubten Funktionen bereit. Node.js bleibt im Renderer deaktiviert (`nodeIntegration: false`, `contextIsolation: true`).

## IPC-API

Die Preload-API ist in mehrere Bereiche gruppiert:

- `window`: Minimize, Maximize, Close.
- `workspace`: Dateien listen, lesen, speichern, neu anlegen, umbenennen, duplizieren, loeschen, im Explorer zeigen.
- `tools`: PowerShell-Scripte fuer Toolcheck und Batch-Rendering.
- `preview`: aktuelle Quelle als SVG rendern.
- `export`: aktuelles Diagramm ueber Save-Dialog exportieren.
- `dialogs`: einfache native Dialoge.
- `app`: Dirty-State an Main Process melden und Close-Guard beantworten.

Alle Dateipfade laufen im Main Process durch `safeWorkspacePath` oder `safeProjectPath`. Dadurch bleiben Dateizugriffe innerhalb des Workspace oder Projektordners.

## Workspace und Dateien

`workspace:list-files` liest nur diese Ordner:

- `diagrams/plantuml`
- `diagrams/mermaid`

PlantUML-Dateien enden auf `.puml`, Mermaid-Dateien auf `.mmd`. Die Files-Seite zeigt oben die letzten Dateien und darunter geschlossene Gruppen fuer PlantUML und Mermaid. Jede Datei wird als Karte mit Mini-SVG-Thumbnail angezeigt. Die Thumbnails werden ueber dieselbe lokale Preview-API erzeugt und im Renderer pro relativen Pfad gecacht.

Der zuletzt aktive Pfad wird in `localStorage` unter `phyto:lastFile` gespeichert. Beim App-Start versucht der Renderer, diese Datei wieder zu oeffnen. Falls sie nicht mehr existiert, faellt die App auf eine Beispiel-Mermaid-Datei oder die erste Mermaid-Datei zurueck.

## Renderer-State

`app/renderer.js` haelt den zentralen Zustand in `state`:

- aktive Datei, Modus und Dirty-State
- Mermaid/PlantUML-Graphmodell
- Auswahl von Nodes und Connections
- Undo/Redo-History fuer visuelle Aenderungen
- Preview-Zoom und Canvas-Zoom/Pan
- Sidepanel-, Console- und Split-Layout
- Autosave- und Theme-Einstellungen
- Thumbnail-Cache fuer File-Karten

Der Renderer nutzt keine Frameworks. UI wird direkt ueber DOM-Referenzen aus `els` gesteuert.

## Layout und Panels

Die App besteht aus:

- Titlebar mit App-Menues, Settings, Autosave-Status und Window-Actions.
- Activity-Bar links mit Build, Files, Preview, Export und Console.
- Main Stage mit Toolbar, visuellem Builder und Code-Editor.
- Overlay-Sidepanel fuer Files, Preview und Export.
- Bottom-Console wie in VS Code, inklusive Resize-Handle.
- Preferences-Modal fuer Autosave und Themes.

Die Main Stage nutzt einen Editor-Split. Standard ist 80 Prozent Canvas und 20 Prozent Code, der Split ist horizontal ziehbar und wird in `localStorage` gespeichert.

## Menues und Shortcuts

Die Top-Menues sind normale Buttons mit Popovers. Shortcut-Hinweise werden im Renderer nach dem Laden in eine rechte `kbd`-Spalte geschrieben, damit Labels und Tastenkombinationen sauber ausgerichtet sind.

Wichtige Shortcuts:

- `Ctrl+N`: neues Diagramm
- `Ctrl+O`: Workspace oeffnen
- `Ctrl+S`: speichern
- `Ctrl+Shift+S`: speichern unter
- `Ctrl+E`: aktuelles Diagramm exportieren
- `Ctrl+Shift+P`: Command Palette
- `Ctrl+0`: Canvas fitten
- `Ctrl+Shift+V`: Diagramm validieren

## Settings und Themes

Settings sind ein grosses Preferences-Modal, nicht mehr ein kleines Dropdown. Aktuell gibt es:

- Autosave an/aus
- Theme-Auswahl

Die Themes liegen als CSS Custom Properties in `app/styles.css`:

- `aurora`
- `midnight`
- `forest`
- `daylight`
- `paper`

Das aktive Theme wird in `localStorage` unter `phyto:theme` gespeichert und ueber `body[data-theme="..."]` angewendet.

## Autosave

Bei jeder Eingabe:

1. `setDirty(true)` setzt den Dirty-State.
2. Der Header zeigt `Autosaving...` oder `Unsaved changes`.
3. `scheduleDraftSave()` startet einen kurzen Debounce.
4. Danach wird ein Draft in `localStorage` gespeichert.
5. Wenn Autosave aktiv ist und die Datei bereits im Workspace existiert, schreibt `autoSaveActiveFile()` direkt in die Datei.
6. Nach Erfolg zeigt der Header `Autosaved HH:MM`.

Neue noch nicht gespeicherte Diagramme werden nicht automatisch als Datei angelegt. Fuer sie existiert nur der Draft, bis der Nutzer speichert.

## Preview-Rendering

Die Live Preview ruft `preview:render` im Main Process auf. PlantUML und Mermaid werden unterschiedlich gerendert:

- PlantUML: `java -jar tools\plantuml.jar -tsvg`
- Mermaid: lokale Mermaid CLI aus `node_modules`, bevorzugt ueber CLI-JS oder `.bin\mmdc.cmd`

Preview-Dateien werden im Electron-UserData-Ordner abgelegt. Der Renderer bekommt nur den SVG-Text zurueck, setzt ihn in die Preview-Flaeche und berechnet einen Fit-Zoom, damit das Diagramm zentriert sichtbar ist.

Die File-Thumbnails verwenden ebenfalls `preview:render`, nur kleiner dargestellt und gecacht.

## Export

Export ist bewusst auf die aktuelle Datei begrenzt. Die Export-Seite funktioniert wie ein Grafikprogramm: Man waehlt Format und Hintergrund und exportiert nur das Diagramm, das gerade geoeffnet ist.

Unterstuetzte Formate:

- SVG
- PNG
- PDF

Der Main Process zeigt einen Save-Dialog, rendert in einen temporaeren Exportordner unter UserData und kopiert das Ergebnis an den gewaehlten Zielpfad.

## Visueller Builder

Der Builder arbeitet intern auf einem Graphmodell:

```js
{
  nodes: [],
  edges: []
}
```

Mermaid-Flowcharts werden mit `parseMermaidFlowchart()` gelesen. Der Parser erkennt einfache Node-Definitionen und Verbindungen. Aenderungen im Builder werden wieder in Mermaid-Source serialisiert.

PlantUML-Klassendiagramme werden mit `parsePlantUmlClassDiagram()` gelesen. Klassen, Attribute, Methoden und Beziehungen werden in Nodes und Edges ueberfuehrt. Die Properties- und Relationship-Editoren schreiben danach wieder Source.

Nicht alle PlantUML- oder Mermaid-Sprachfeatures sind visuell editierbar. Der Code-Editor bleibt deshalb immer die vollstaendige Quelle der Wahrheit.

## Organisieren und Layout

`Organize` nutzt die lokal exportierte SVG-Vorschau als Layout-Quelle. Die App rendert zuerst das Diagramm, liest Positionsdaten aus dem SVG und uebertraegt sie auf die Builder-Nodes. Waehrenddessen wird Editing deaktiviert und ein Overlay zeigt, dass ein Prozess laeuft.

Wenn kein brauchbares SVG-Layout extrahiert werden kann, wird `autoLayoutGraph()` als Fallback verwendet. Dieser Fallback verteilt Nodes in Spalten/Reihen, damit das Diagramm wieder lesbar wird.

## Auswahl und Relationship-Editor

Nodes und Connections sind klickbar. Klicks auf leere Canvas-Flaechen entfernen die Auswahl. Connection-Editoren werden als Popover nahe der Verbindung geoeffnet und an den Viewport geclamped, damit sie sichtbar bleiben.

## Undo und Redo

Visuelle Aenderungen erzeugen Snapshots. Die History liegt im Renderer unter `state.history` und hat ein Limit von 80 Eintraegen. Texteditor-Undo bleibt nativ im Textarea-Feld.

## Close-Guard

Der Renderer meldet Dirty-State ueber `app:setDirty` an den Main Process. Beim Fenster-Schliessen zeigt der Main Process einen nativen Dialog:

- Save
- Don't Save
- Cancel

Bei `Save` bekommt der Renderer ein `app:before-close` Event, speichert die aktive Datei und meldet das Ergebnis zurueck.

## Git und generierte Dateien

Die `.gitignore` ignoriert:

- `node_modules`
- `dist`
- `output`
- Logs
- lokale `.env` Dateien
- Build- und Cache-Ordner

Wichtig: `.mmd` und `.puml` Dateien sind explizit nicht ignoriert. Diagrammquellen gehoeren ins Repo, generierte Render-Ausgaben nicht.

## Tooling

`scripts\check-tools.ps1` prueft Java, Graphviz, PlantUML, Node/npm und Mermaid CLI. Wenn Preview oder Export nicht funktionieren, ist dieses Script der erste Debug-Schritt.

`%LOCALAPPDATA%\Phyto Studio\launch.log` enthaelt Start- und Fehlerlogs des Electron-Main-Processes.

## Typische Entwicklungsroutine

```powershell
npm install
npm run check-tools
node --check app\renderer.js
npm start
```

Vor einem Release:

```powershell
node --check app\renderer.js
npm run check-tools
npm run build:win
```

Falls der Build wegen gesperrter Dateien fehlschlaegt, zuerst laufende `Phyto Studio.exe` Prozesse beenden und danach erneut bauen.
