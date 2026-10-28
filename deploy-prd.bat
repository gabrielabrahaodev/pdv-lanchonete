@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Publicar NexoComanda
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-prd.ps1" %*
set "PDV_EXIT=%ERRORLEVEL%"
if not defined CI pause
endlocal & exit /b %PDV_EXIT%
