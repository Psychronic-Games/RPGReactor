@echo off
REM RPG Reactor Launcher Script

REM Get the directory where this script is located
set "APP_DIR=%~dp0"
set "REPO_DIR=%APP_DIR%..\"

if exist "%APP_DIR%nwjs-win\nw.exe" (
    set "NW_BINARY=%APP_DIR%nwjs-win\nw.exe"
) else if exist "%REPO_DIR%nwjs-win\nw.exe" (
    set "NW_BINARY=%REPO_DIR%nwjs-win\nw.exe"
) else (
    echo Could not find NW.js. Expected nwjs-win\nw.exe in:
    echo   %APP_DIR%
    echo   %REPO_DIR%
    exit /b 1
)

cd /d "%APP_DIR%"

REM Launch the application using Windows-specific NW.js binaries
"%NW_BINARY%" .
