$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CloudflaredPath = "$ProjectDir\cloudflared.exe"

# Check/Download cloudflared
if (-not (Test-Path $CloudflaredPath)) {
    Write-Host "Baixando Cloudflare Tunnel..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    try {
        Invoke-WebRequest -Uri $url -OutFile $CloudflaredPath -UseBasicParsing
        Write-Host "Download concluido!" -ForegroundColor Green
    } catch {
        Write-Host "Erro ao baixar cloudflared. Baixe manualmente em:" -ForegroundColor Red
        Write-Host "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
        Write-Host "  e salve o cloudflared.exe na pasta do projeto." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SISTEMA UPS - Iniciando..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start Node server in background
$nodeJob = Start-Job -ScriptBlock {
    Set-Location $using:ProjectDir
    node server.js
}

Write-Host "Aguardando servidor iniciar..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "Iniciando Cloudflare Tunnel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  TUNEL PUBLICO - Compartilhe esta URL:" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Start tunnel - shows URL in console
try {
    & $CloudflaredPath tunnel --url http://localhost:3000
} finally {
    # Cleanup: stop Node server when tunnel exits
    Stop-Job $nodeJob -ErrorAction SilentlyContinue
    Remove-Job $nodeJob -ErrorAction SilentlyContinue
}
