# install.ps1 -- install / uninstall dsh-boot-guard plugin
# Safe, reversible, ASCII-only script for PowerShell 5.1 (preserves LF line endings).

param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$sourceDir = $PSScriptRoot

$dshHome = $env:DSH_HOME
if (-not $dshHome -or -not (Test-Path $dshHome)) {
    $fallback = Join-Path $env:USERPROFILE '.dsh'
    if (Test-Path $fallback) {
        $dshHome = $fallback
    } else {
        $dshHome = 'D:\DeepSeekHarness\.dsh'
    }
}

if (-not (Test-Path $dshHome)) {
    throw "DSH home directory not found: $dshHome. Please specify DSH_HOME environment variable."
}

$profileDir = Join-Path $dshHome 'profiles\desktop'
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$nodeModules = Join-Path $profileDir 'node_modules'
$targetJunction = Join-Path $nodeModules 'dsh-boot-guard'

if (-not (Test-Path $patchFile)) {
    throw "cordis.patch.yml not found at: $patchFile"
}

function Get-Sha256($path) {
    return (Get-FileHash -Path $path -Algorithm SHA256).Hash
}

if ($Uninstall) {
    Write-Host "=== Uninstalling dsh-boot-guard ==="
    
    if (Test-Path $targetJunction) {
        Write-Host "Removing junction: $targetJunction"
        [System.IO.Directory]::Delete($targetJunction, $false)
    }

    $patchText = [System.IO.File]::ReadAllText($patchFile, [System.Text.Encoding]::UTF8)
    if ($patchText -match '-\s*insert:\s*dsh-boot-guard') {
        $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $bak = "$patchFile.bak-pre-uninstall-$ts"
        [System.IO.File]::Copy($patchFile, $bak, $true)
        Write-Host "Backup created: $bak (SHA256: $(Get-Sha256 $bak))"

        $lines = $patchText -split "`r?`n"
        $newLines = @()
        foreach ($line in $lines) {
            if ($line -notmatch '-\s*insert:\s*dsh-boot-guard') {
                $newLines += $line
            }
        }
        $outText = ($newLines -join "`n")
        [System.IO.File]::WriteAllBytes($patchFile, [System.Text.Encoding]::UTF8.GetBytes($outText))
        Write-Host "Removed insert row from cordis.patch.yml (New SHA256: $(Get-Sha256 $patchFile))"
    }
    Write-Host "Uninstall completed."
    exit 0
}

Write-Host "=== Installing dsh-boot-guard ==="
Write-Host "DSH_HOME: $dshHome"

if (-not (Test-Path $nodeModules)) {
    New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null
}

if (-not (Test-Path $targetJunction)) {
    Write-Host "Creating junction: $targetJunction -> $sourceDir"
    cmd /c mklink /J "$targetJunction" "$sourceDir" | Out-Null
} else {
    Write-Host "Junction already exists: $targetJunction"
}

$patchText = [System.IO.File]::ReadAllText($patchFile, [System.Text.Encoding]::UTF8)
if ($patchText -match '-\s*insert:\s*dsh-boot-guard') {
    Write-Host "dsh-boot-guard is already inserted in cordis.patch.yml"
} else {
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $bak = "$patchFile.bak-pre-guard-$ts"
    [System.IO.File]::Copy($patchFile, $bak, $true)
    Write-Host "Backup created: $bak (SHA256: $(Get-Sha256 $bak))"

    $lines = $patchText -split "`r?`n"
    $newLines = @()
    $inserted = $false
    foreach ($line in $lines) {
        if (-not $inserted -and $line -match '^\s*-\s*insert:') {
            $newLines += "  - insert: dsh-boot-guard"
            $inserted = $true
        }
        $newLines += $line
    }
    if (-not $inserted) {
        $newLines += "  - insert: dsh-boot-guard"
    }

    $outText = ($newLines -join "`n")
    [System.IO.File]::WriteAllBytes($patchFile, [System.Text.Encoding]::UTF8.GetBytes($outText))
    Write-Host "Added '  - insert: dsh-boot-guard' to cordis.patch.yml"
    Write-Host "New SHA256: $(Get-Sha256 $patchFile)"
}

Write-Host "Installation completed. Test with 'npm test' or launch DSH."
