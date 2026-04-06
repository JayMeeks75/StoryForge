@echo off
setlocal

set "APP_DIR=%~dp0"
set "NODE_EXE=node"

where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\portable-dev\tools\node\node-v20.7.0-win-x64\node.exe" (
    set "NODE_EXE=C:\portable-dev\tools\node\node-v20.7.0-win-x64\node.exe"
  ) else (
    echo Node.js was not found on PATH or in C:\portable-dev\tools\node\node-v20.7.0-win-x64
    exit /b 1
  )
)

cd /d "%APP_DIR%"
start "" http://localhost:8788
"%NODE_EXE%" server.mjs
