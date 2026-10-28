@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Publicar NexoComanda - Git, Render e Firebase
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-prd.ps1" %*
set "PDV_EXIT=%ERRORLEVEL%"
if not defined CI pause
endlocal & exit /b %PDV_EXIT%
