@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\native.ps1 -Action run
if errorlevel 1 pause
