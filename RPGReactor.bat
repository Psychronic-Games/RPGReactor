@echo off
REM RPG Reactor convenience launcher for source checkouts. The NW.js app lives in editor\.

cd /d "%~dp0editor"
call RPGReactor.bat %*
