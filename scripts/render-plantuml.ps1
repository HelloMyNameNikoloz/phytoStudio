$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PlantUmlJar = Join-Path $ProjectRoot "tools\plantuml.jar"
$InputDir = Join-Path $ProjectRoot "diagrams\plantuml"
$OutputDir = Join-Path $ProjectRoot "output\plantuml"
$CommonGraphvizDot = "C:\Program Files\Graphviz\bin\dot.exe"

if (-not (Test-Path -LiteralPath $PlantUmlJar -PathType Leaf)) {
    Write-Error "PlantUML jar was not found at: $PlantUmlJar"
    exit 1
}

if (-not (Get-Command "java" -ErrorAction SilentlyContinue)) {
    Write-Error "Java was not found. Install Java 17 or newer and try again."
    exit 1
}

if (-not (Get-Command "dot" -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $CommonGraphvizDot -PathType Leaf)) {
    $env:GRAPHVIZ_DOT = $CommonGraphvizDot
    $env:PATH = "$(Split-Path $CommonGraphvizDot);$env:PATH"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$PlantUmlFiles = Get-ChildItem -LiteralPath $InputDir -Filter "*.puml" -File

if ($PlantUmlFiles.Count -eq 0) {
    Write-Host "No PlantUML files found in: $InputDir"
    exit 0
}

Write-Host "Rendering PlantUML diagrams to PNG..."
& java -jar $PlantUmlJar -tpng -o $OutputDir $PlantUmlFiles.FullName

Write-Host "Rendering PlantUML diagrams to SVG..."
& java -jar $PlantUmlJar -tsvg -o $OutputDir $PlantUmlFiles.FullName

Write-Host "Rendering PlantUML diagrams to PDF..."
& java -jar $PlantUmlJar -tpdf -o $OutputDir $PlantUmlFiles.FullName

Write-Host "PlantUML diagrams rendered to PNG, SVG, and PDF: $OutputDir" -ForegroundColor Green
