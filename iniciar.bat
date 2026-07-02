@echo off
cd /d "%~dp0"
echo ========================================
echo   SISTEMA UPS - Iniciando servidor...
echo ========================================
echo.
echo  Para acesso local (mesma rede):
echo    Execute este arquivo e use o IP exibido
echo.
echo  Para acesso de qualquer lugar (internet):
echo    Execute:  powershell -ExecutionPolicy Bypass -File "iniciar-tunel.ps1"
echo.
echo ========================================
echo.
node server.js
pause
