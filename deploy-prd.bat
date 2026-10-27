@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Publicar NexoComanda
cd /d "%~dp0"
if errorlevel 1 goto erro

set "PDV_PROJECT=pdv-lanchonete-1fa79"
set "PDV_HOSTING=nexocomanda"
set "VITE_API_URL=https://pdv-lanchonete-dwiw.onrender.com"

echo === Publicar NexoComanda em producao ===
echo Projeto Firebase: %PDV_PROJECT%
echo Site: https://nexocomanda.web.app
echo.

where git >nul 2>&1
if errorlevel 1 goto ferramentas
where npm >nul 2>&1
if errorlevel 1 goto ferramentas
where firebase >nul 2>&1
if errorlevel 1 goto ferramentas
if not exist "firebase.json" goto pasta
if not exist "frontend\package-lock.json" goto pasta

git rev-parse --show-toplevel >nul 2>&1
if errorlevel 1 goto pasta
set "PDV_BRANCH="
for /f "delims=" %%B in ('git branch --show-current') do set "PDV_BRANCH=%%B"
if not "%PDV_BRANCH%"=="master" (
    echo ERRO: entre na branch master antes de publicar.
    goto erro
)
git diff --quiet
if errorlevel 1 goto alteracoes
git diff --cached --quiet
if errorlevel 1 goto alteracoes

call git fetch origin master
if errorlevel 1 goto erro
set "PDV_LOCAL="
set "PDV_REMOTE="
for /f "delims=" %%H in ('git rev-parse HEAD') do set "PDV_LOCAL=%%H"
for /f "delims=" %%H in ('git rev-parse FETCH_HEAD') do set "PDV_REMOTE=%%H"
if not defined PDV_LOCAL goto erro
if not defined PDV_REMOTE goto erro
if not "%PDV_LOCAL%"=="%PDV_REMOTE%" (
    echo ERRO: sua master difere da master do GitHub.
    echo Atualize com git pull --ff-only origin master e execute novamente.
    goto erro
)

echo Versao a publicar: %PDV_LOCAL%
echo Antes de continuar, o fluxo deve estar testado em localhost
echo e este commit deve estar Live no backend da Render.
echo Este script publica regras Firestore e frontend; nao faz merge ou deploy da Render.
choice /C SN /N /M "Testes locais concluidos, backend Live e deseja publicar? [S/N]: "
if errorlevel 2 goto cancelado
if errorlevel 1 goto publicar
goto erro

:publicar
cd frontend
if errorlevel 1 goto erro
call npm ci
if errorlevel 1 goto erro
call npm run test:precificacao
if errorlevel 1 goto erro
call npm run test:seguranca
if errorlevel 1 goto erro
call npm run build
if errorlevel 1 goto erro
cd /d "%~dp0"
if errorlevel 1 goto erro

call firebase deploy --only firestore:rules --project "%PDV_PROJECT%"
if errorlevel 1 goto erro
call firebase deploy --only hosting:%PDV_HOSTING% --project "%PDV_PROJECT%"
if errorlevel 1 goto erro

echo.
echo PUBLICACAO CONCLUIDA: https://nexocomanda.web.app
echo Abra o site, atualize com Ctrl+Shift+R e confira o funcionamento.
pause
endlocal
exit /b 0

:ferramentas
echo ERRO: Git, Node/npm e Firebase CLI devem estar instalados e no PATH.
goto erro
:pasta
echo ERRO: coloque este BAT na raiz do repositorio, junto de firebase.json.
goto erro
:alteracoes
echo ERRO: existem alteracoes em arquivos versionados. Revise antes de publicar.
goto erro
:cancelado
echo Publicacao cancelada.
pause
endlocal
exit /b 0
:erro
echo.
echo PUBLICACAO INTERROMPIDA. Confira a mensagem de erro acima.
echo Se o Firebase pedir autenticacao, execute firebase login e tente novamente.
echo Etapas ja concluidas nao sao desfeitas automaticamente.
pause
endlocal
exit /b 1
