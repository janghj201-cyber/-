@echo off
cd /d "%~dp0"
echo Starting WeVape local server...
echo Open http://localhost:8080 in Chrome
python -m http.server 8080
pause
