$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DistDir = Join-Path $ProjectRoot "dist"
$LauncherPath = Join-Path $DistDir "Phyto Studio.exe"
$IconPath = Join-Path $ProjectRoot "build\icon.ico"
$LauncherSourceDir = Join-Path $ProjectRoot "build\launcher-src"
$LauncherPublishDir = Join-Path $ProjectRoot "build\launcher-publish"

if (-not (Get-Command "dotnet" -ErrorAction SilentlyContinue)) {
    Write-Error ".NET SDK was not found. Install the .NET SDK or use Start Phyto Studio.cmd instead."
    exit 1
}

New-Item -ItemType Directory -Force -Path $DistDir, $LauncherSourceDir, $LauncherPublishDir | Out-Null

$ProjectFile = Join-Path $LauncherSourceDir "PhytoStudioLauncher.csproj"
$ProgramFile = Join-Path $LauncherSourceDir "Program.cs"

$IconLine = ""
if (Test-Path -LiteralPath $IconPath -PathType Leaf) {
    $IconLine = "<ApplicationIcon>$IconPath</ApplicationIcon>"
}

@"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    $IconLine
  </PropertyGroup>
</Project>
"@ | Set-Content -LiteralPath $ProjectFile -Encoding UTF8

@"
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string appPath = Path.Combine(baseDir, "win-unpacked", "Phyto Studio.exe");

        if (!File.Exists(appPath))
        {
            MessageBox.Show(
                "Phyto Studio was not found next to this launcher.\n\nExpected path:\n" + appPath,
                "Phyto Studio",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        ProcessStartInfo startInfo = new ProcessStartInfo(appPath)
        {
            WorkingDirectory = Path.GetDirectoryName(appPath),
            UseShellExecute = false
        };

        startInfo.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
        Process.Start(startInfo);
    }
}
"@ | Set-Content -LiteralPath $ProgramFile -Encoding UTF8

dotnet publish $ProjectFile `
    --configuration Release `
    --runtime win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:EnableCompressionInSingleFile=true `
    -p:DebugType=None `
    -p:DebugSymbols=false `
    --output $LauncherPublishDir

$PublishedLauncher = Join-Path $LauncherPublishDir "PhytoStudioLauncher.exe"
if (-not (Test-Path -LiteralPath $PublishedLauncher -PathType Leaf)) {
    Write-Error "Launcher build did not produce: $PublishedLauncher"
    exit 1
}

Copy-Item -LiteralPath $PublishedLauncher -Destination $LauncherPath -Force
Write-Host "Created no-install launcher: $LauncherPath"
