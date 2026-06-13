# Phyto Studio

Phyto Studio ist eine lokale Windows-Desktop-App zum Erstellen, Bearbeiten, Vorschauen und Exportieren von PlantUML- und Mermaid-Diagrammen. Die App rendert alles lokal, speichert `.puml` und `.mmd` Dateien im Workspace und exportiert das aktuelle Diagramm als SVG, PNG oder PDF.

## Installation

Voraussetzungen:

- Node.js und npm
- Java 17 oder neuer
- Graphviz
- `tools\plantuml.jar`

Einrichten und starten:

```powershell
npm install
npm run check-tools
npm start
```

Windows-Build erstellen:

```powershell
npm run build:win
```

Danach kann die App über `dist\Phyto Studio.exe` gestartet werden.

Weitere technische Details stehen in `DEV.md`.
