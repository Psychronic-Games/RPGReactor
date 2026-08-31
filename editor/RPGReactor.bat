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

REM Launch the application using Windows-specific NW.js binaries.
REM `start` hands the editor off and lets this script exit. Without it cmd
REM runs nw.exe synchronously, so a console window sits open behind the
REM editor for the whole session -- and closing that window kills the
REM editor with it. The Linux launcher deliberately stays in the
REM foreground instead: it holds an instance lock it cleans up on EXIT.
start "" "%NW_BINARY%" .
