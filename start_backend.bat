@echo off
setlocal

set PROJECT_DIR=C:\1booking
set BACKEND_DIR=%PROJECT_DIR%\backend

title Biometric Ticket Booking - Backend

echo ============================================
echo  Biometric Ticket Booking - Backend Starter
echo ============================================
echo.

if not exist "%BACKEND_DIR%" (
    echo ERROR: Backend folder not found: %BACKEND_DIR%
    echo Please check that the project is extracted to C:\1booking
    pause
    exit /b 1
)

cd /d "%BACKEND_DIR%"

if not exist "venv\Scripts\activate.bat" (
    echo Python virtual environment not found. Creating venv...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create Python virtual environment.
        echo Make sure Python is installed and available in PATH.
        pause
        exit /b 1
    )
)

call venv\Scripts\activate.bat

if exist "requirements.txt" (
    echo Installing / checking backend dependencies...
    python -m pip install --upgrade pip
    pip install -r requirements.txt
) else (
    echo requirements.txt not found. Installing default backend dependencies...
    python -m pip install --upgrade pip
    pip install fastapi uvicorn pydantic python-multipart
)

echo.
echo Backend will run at:
echo   http://127.0.0.1:8000
echo API Docs:
echo   http://127.0.0.1:8000/docs
echo.
echo Press CTRL+C to stop the backend.
echo.

uvicorn app:app --reload

pause
