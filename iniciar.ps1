# Iniciar o painel BoxTv no Windows PowerShell.
param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$panelDir = Join-Path $projectRoot 'panel'

Write-Host ''
Write-Host ' ==========================================' -ForegroundColor Cyan
Write-Host '             BOXTV - PAINEL' -ForegroundColor Cyan
Write-Host ' ==========================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22.13 ou mais recente não foi encontrado.'
}

$nodeVersion = (& node --version).Trim()
Write-Host " Node.js: $nodeVersion" -ForegroundColor Green
Write-Host " Painel:  http://localhost:$Port/admin" -ForegroundColor White
Write-Host ''

if (-not (Test-Path (Join-Path $panelDir '.env'))) {
    Write-Host ' .env não encontrado. O servidor gerará uma senha temporária e a exibirá no console.' -ForegroundColor Yellow
}

Set-Location $panelDir
& node --env-file-if-exists=.env --max-old-space-size=400 server.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "O servidor encerrou com código $LASTEXITCODE." -ForegroundColor Red
}
