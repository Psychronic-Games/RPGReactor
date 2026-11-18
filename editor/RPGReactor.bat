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
REM
REM The graphics backend for this machine: a note the editor left on an earlier
REM run, from what the game found by playing (PlaytestManager.editorBackend).
REM The browser reads its backend from its command line before the editor
REM runs, so it has to be said here. Only the names below are taken.
REM Vulkan goes without DirectComposition, or its window shows nothing
REM (ProjectManager.WINDOW_PRESENT_ARG), and without pipeline libraries, or
REM what is blended shows its triangles, and without the swapchain's maintenance
REM extension, or a resize crashes the graphics process on NVIDIA
REM (ProjectManager.PIPELINE_LIBRARY_ARG).
set "RR_ANGLE="
set "RR_ANGLE_ARGS="
if exist "%LOCALAPPDATA%\RPGReactor\editor-angle.txt" set /p RR_ANGLE=<"%LOCALAPPDATA%\RPGReactor\editor-angle.txt"
if /i "%RR_ANGLE%"=="gl" set "RR_ANGLE_ARGS=--use-angle=gl --rr-editor-angle=gl"
if /i "%RR_ANGLE%"=="d3d11on12" set "RR_ANGLE_ARGS=--use-angle=d3d11on12 --rr-editor-angle=d3d11on12"
if /i "%RR_ANGLE%"=="vulkan" set "RR_ANGLE_ARGS=--use-angle=vulkan --disable-direct-composition --disable-angle-features=supportsGraphicsPipelineLibrary,supportsSwapchainMaintenance1 --rr-editor-angle=vulkan"
start "" "%NW_BINARY%" . %RR_ANGLE_ARGS%
