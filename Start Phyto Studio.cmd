@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "APP_DIR=%~dp0dist\win-unpacked"
set "APP_EXE=%APP_DIR%\Phyto Studio.exe"

if not exist "%APP_EXE%" (
  echo Phyto Studio executable was not found:
  echo %APP_EXE%
  echo.
  echo Run this first:
  echo npm run build:win
  pause
  exit /b 1
)

start "" "%APP_EXE%"
endlocal
