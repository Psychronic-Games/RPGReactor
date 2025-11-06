@echo off
REM RPG Reactor Launcher Script

REM Get the directory where this script is located
cd /d "%~dp0"

REM Launch the application using Windows-specific NW.js binaries
nwjs-win\nw.exe .
