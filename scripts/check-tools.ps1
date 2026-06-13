$ErrorActionPreference = "Continue"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PlantUmlJar = Join-Path $ProjectRoot "tools\plantuml.jar"
$LocalMermaidCli = Join-Path $ProjectRoot "node_modules\.bin\mmdc.cmd"
$PackageMermaidCli = Join-Path $ProjectRoot "node_modules\@mermaid-js\mermaid-cli\src\cli.js"
$CommonGraphvizDot = "C:\Program Files\Graphviz\bin\dot.exe"
$AllToolsFound = $true

function Test-CommandAvailable {
    param(
        [Parameter(Mandatory = $true)]
        [string] $CommandName
    )

    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Test-DotAvailable {
    if (Test-CommandAvailable "dot") {
        return $true
    }

    return Test-Path -LiteralPath $CommonGraphvizDot -PathType Leaf
}

function Test-MermaidCliAvailable {
    if (Test-Path -LiteralPath $LocalMermaidCli -PathType Leaf) {
        return $true
    }

    if ((Test-Path -LiteralPath $PackageMermaidCli -PathType Leaf) -and (Test-CommandAvailable "node")) {
        return $true
    }

    return Test-CommandAvailable "mmdc"
}

function Write-ToolStatus {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,

        [Parameter(Mandatory = $true)]
        [bool] $Found,

        [Parameter(Mandatory = $true)]
        [string] $InstallHelp
    )

    if ($Found) {
        Write-Host "[OK] $Name found" -ForegroundColor Green
    }
    else {
        Write-Host "[MISSING] $Name" -ForegroundColor Yellow
        Write-Host "How to install: $InstallHelp"
        $script:AllToolsFound = $false
    }
}

Write-ToolStatus `
    -Name "Java" `
    -Found (Test-CommandAvailable "java") `
    -InstallHelp "Install Java 17 or newer, then check with: java -version"

Write-ToolStatus `
    -Name "Graphviz dot" `
    -Found (Test-DotAvailable) `
    -InstallHelp "Run: winget install Graphviz.Graphviz"

Write-ToolStatus `
    -Name "PlantUML jar" `
    -Found (Test-Path -LiteralPath $PlantUmlJar -PathType Leaf) `
    -InstallHelp "Download plantuml.jar and save it to: tools\plantuml.jar"

Write-ToolStatus `
    -Name "Node" `
    -Found (Test-CommandAvailable "node") `
    -InstallHelp "Install Node.js from https://nodejs.org, then check with: node -v"

Write-ToolStatus `
    -Name "npm" `
    -Found (Test-CommandAvailable "npm") `
    -InstallHelp "Install Node.js from https://nodejs.org, then check with: npm -v"

Write-ToolStatus `
    -Name "Mermaid CLI" `
    -Found (Test-MermaidCliAvailable) `
    -InstallHelp "Run: npm install --save-dev @mermaid-js/mermaid-cli, or install globally with: npm install -g @mermaid-js/mermaid-cli"

if ($AllToolsFound) {
    Write-Host ""
    Write-Host "All required diagram tools are available." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "One or more required tools are missing. Install them and run this script again." -ForegroundColor Yellow
exit 1
