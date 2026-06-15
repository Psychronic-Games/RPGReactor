@echo off
REM Convenience launcher for source checkouts. The NW.js app lives in editor\.

cd /d "%~dp0editor"
call RPGReactor.bat %*
