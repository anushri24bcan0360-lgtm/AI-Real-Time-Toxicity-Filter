@echo off
cd /d "%~dp0"
echo Starting the local toxicity model API on http://127.0.0.1:8000/
python -m uvicorn main:app --host 127.0.0.1 --port 8000
echo.
echo The backend stopped. If an error appeared above, check that Python dependencies are installed
echo and that port 8000 is not already in use.
pause
