Param(
  [string]$Bundles = "msi,nsis"
)

$isWindows = $env:OS -eq "Windows_NT"
if (-not $isWindows) {
  Write-Host "This script must be run on Windows."
  exit 1
}

function Assert-Path {
  param([string]$Path, [string]$Message)
  if (-not (Test-Path $Path)) {
    Write-Host $Message
    exit 1
  }
}

$root = Split-Path -Parent $PSScriptRoot
Assert-Path (Join-Path $root "src-tauri\tauri.conf.json") "Missing tauri.conf.json"
Assert-Path (Join-Path $root "src-tauri\icons\icon.ico") "Missing Windows icon: src-tauri\icons\icon.ico"
Assert-Path (Join-Path $root "src-tauri\icons\128x128.png") "Missing Windows icon: src-tauri\icons\128x128.png"

Write-Host "Building Windows bundles: $Bundles"
npm run tauri build -- --bundles $Bundles
if ($LASTEXITCODE -ne 0) {
  Write-Host "Windows build failed."
  exit $LASTEXITCODE
}

Write-Host "Windows build complete."
