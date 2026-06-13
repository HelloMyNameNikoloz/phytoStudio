$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$InputDir = Join-Path $ProjectRoot "diagrams\mermaid"
$OutputDir = Join-Path $ProjectRoot "output\mermaid"
$MermaidConfig = Join-Path $ProjectRoot "config\mermaid-config.json"
$LocalMermaidCli = Join-Path $ProjectRoot "node_modules\.bin\mmdc.cmd"
$PackageMermaidCli = Join-Path $ProjectRoot "node_modules\@mermaid-js\mermaid-cli\src\cli.js"

if (Test-Path -LiteralPath $LocalMermaidCli -PathType Leaf) {
    $MermaidCommand = $LocalMermaidCli
    $MermaidPrefixArgs = @()
}
elseif ((Test-Path -LiteralPath $PackageMermaidCli -PathType Leaf) -and (Get-Command "node" -ErrorAction SilentlyContinue)) {
    $MermaidCommand = "node"
    $MermaidPrefixArgs = @($PackageMermaidCli)
}
else {
    $GlobalMermaidCommand = Get-Command "mmdc" -ErrorAction SilentlyContinue
    if ($GlobalMermaidCommand) {
        $MermaidCommand = $GlobalMermaidCommand.Source
        $MermaidPrefixArgs = @()
    }
}

if (-not $MermaidCommand) {
    Write-Error "Mermaid CLI was not found. Run: npm install"
    exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$MermaidFiles = Get-ChildItem -LiteralPath $InputDir -Filter "*.mmd" -File

if ($MermaidFiles.Count -eq 0) {
    Write-Host "No Mermaid files found in: $InputDir"
    exit 0
}

foreach ($File in $MermaidFiles) {
    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
    $SvgOutput = Join-Path $OutputDir "$BaseName.svg"
    $PngOutput = Join-Path $OutputDir "$BaseName.png"
    $PdfOutput = Join-Path $OutputDir "$BaseName.pdf"

    $CommonArgs = @("-i", $File.FullName, "--quiet")
    if (Test-Path -LiteralPath $MermaidConfig -PathType Leaf) {
        $CommonArgs += @("-c", $MermaidConfig)
    }

    Write-Host "Rendering Mermaid SVG: $($File.Name)"
    & $MermaidCommand @MermaidPrefixArgs @CommonArgs -o $SvgOutput -b transparent

    Write-Host "Rendering Mermaid PNG: $($File.Name)"
    & $MermaidCommand @MermaidPrefixArgs @CommonArgs -o $PngOutput -b transparent

    Write-Host "Rendering Mermaid PDF: $($File.Name)"
    & $MermaidCommand @MermaidPrefixArgs @CommonArgs -o $PdfOutput
}

Write-Host "Mermaid diagrams rendered to SVG, PNG, and PDF: $OutputDir" -ForegroundColor Green
