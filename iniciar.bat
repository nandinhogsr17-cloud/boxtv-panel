@echo off
chcp 65001 >nul
setlocal
title BoxTv - Painel

cd /d "%~dp0panel"

echo.
echo  ==========================================
echo             BOXTV - PAINEL
echo  ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado. Instale Node.js 22.13 ou mais recente.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo Node.js: %NODE_VER%
echo Endereco padrao: http://localhost:8080/admin
echo.
if not exist ".env" echo AVISO: .env nao encontrado. O servidor criara uma senha temporaria e a mostrara abaixo.
echo Iniciando servidor. Feche esta janela para parar.
echo.

node --env-file-if-exists=.env --max-old-space-size=400 server.js

if errorlevel 1 (
    echo.
    echo O servidor encerrou com erro. Confira a mensagem acima.
    pause
)
