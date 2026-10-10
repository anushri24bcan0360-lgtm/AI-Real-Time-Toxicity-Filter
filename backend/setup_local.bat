@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    where py >nul 2>nul
    if not errorlevel 1 (
        py -3 -m venv .venv
    ) else (
        where python >nul 2>nul
        if errorlevel 1 (
            echo ERROR: Python 3 is not installed or is not on PATH.
            echo Install Python 3.10 or newer, then run this script again.
            pause
            exit /b 1
        )
        python -m venv .venv
    )
    if errorlevel 1 (
        echo ERROR: Could not create backend\.venv.
        pause
        exit /b 1
    )
)

echo Installing backend dependencies into backend\.venv...
echo This may take several minutes because the CPU PyTorch package is large.
"%~dp0.venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :install_failed
"%~dp0.venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :install_failed

echo.
echo Setup complete. Start the local API with start_backend.bat.
pause
exit /b 0

:install_failed
echo.
echo ERROR: Dependency installation failed. Check the Python and pip output above.
pause
exit /b 1
