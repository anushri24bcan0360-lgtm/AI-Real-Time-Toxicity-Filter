@echo off
setlocal
cd /d "%~dp0"

if not defined MODEL_DIR set "MODEL_DIR=%~dp0model"
if not defined HINGLISH_MODEL_DIR set "HINGLISH_MODEL_DIR=%~dp0model_hinglish"

set "API_HEALTH="
for /f "delims=" %%H in ('curl.exe --silent --max-time 2 http://127.0.0.1:8000/ 2^>nul') do set "API_HEALTH=%%H"
if defined API_HEALTH (
    echo %API_HEALTH% | findstr /C:"model_loaded" | findstr /C:"true" >nul
    if not errorlevel 1 (
        echo The local toxicity API is already running and its models are loaded at http://127.0.0.1:8000/.
        echo Use the existing API; a second copy is not needed.
        exit /b 0
    )
)

netstat -ano -p tcp | findstr /R /C:":8000 .*LISTENING" >nul
if not errorlevel 1 (
    echo ERROR: Port 8000 is already in use by another process.
    echo Check http://127.0.0.1:8000/ for model_loaded=true, or stop the process using port 8000.
    pause
    exit /b 1
)

if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

if not exist "%MODEL_DIR%\model.onnx" (
    echo ERROR: English ONNX model not found: "%MODEL_DIR%\model.onnx"
    echo Set MODEL_DIR to the folder containing model.onnx and its tokenizer files.
    pause
    exit /b 1
)
if not exist "%MODEL_DIR%\tokenizer.json" (
    echo ERROR: English tokenizer not found: "%MODEL_DIR%\tokenizer.json"
    pause
    exit /b 1
)
if not exist "%HINGLISH_MODEL_DIR%\model.safetensors" (
    echo ERROR: Hinglish model weights not found: "%HINGLISH_MODEL_DIR%\model.safetensors"
    echo The local Hinglish checkpoint is required to run the ensemble.
    pause
    exit /b 1
)
if not exist "%HINGLISH_MODEL_DIR%\tokenizer.json" (
    echo ERROR: Hinglish tokenizer not found: "%HINGLISH_MODEL_DIR%\tokenizer.json"
    pause
    exit /b 1
)

"%PYTHON_EXE%" -c "import importlib.util,sys; names=('fastapi','uvicorn','onnxruntime','transformers','torch','numpy'); missing=[name for name in names if importlib.util.find_spec(name) is None]; print('Missing Python packages: '+', '.join(missing) if missing else 'Python dependencies are ready.'); sys.exit(bool(missing))"
if errorlevel 1 (
    echo.
    echo Run setup_local.bat once to create the local environment and install dependencies.
    pause
    exit /b 1
)

echo.
echo Starting both local toxicity models at http://127.0.0.1:8000/
echo Startup loads the English ONNX model and the local Hinglish model. This can take a minute.
echo Keep this window open while using the extension. Press Ctrl+C to stop the API.
echo.
"%PYTHON_EXE%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --log-level info

echo.
echo The backend stopped. Check the messages above if startup failed or port 8000 is busy.
pause
