@echo off
cd /d "C:\Users\grupo\Desktop\projeto-aplicativo-ups"
echo ========================================
echo   SISTEMA UPS - Iniciando servidor...
echo ========================================
echo.
echo  Aguarde o servidor iniciar...
echo  Seu IP local sera exibido no console.
echo  Use esse IP para acessar de outros dispositivos.
echo.
node server.js
pause
