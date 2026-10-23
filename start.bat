@echo off
cd /d "%~dp0"
echo Pakketten controleren...
call npm install --no-audit --no-fund
call npm start
