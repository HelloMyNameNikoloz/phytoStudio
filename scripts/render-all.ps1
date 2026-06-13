$ErrorActionPreference = "Stop"

$CheckToolsScript = Join-Path $PSScriptRoot "check-tools.ps1"
$RenderPlantUmlScript = Join-Path $PSScriptRoot "render-plantuml.ps1"
$RenderMermaidScript = Join-Path $PSScriptRoot "render-mermaid.ps1"

& $CheckToolsScript
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& $RenderPlantUmlScript
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& $RenderMermaidScript
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "All diagrams rendered successfully." -ForegroundColor Green
