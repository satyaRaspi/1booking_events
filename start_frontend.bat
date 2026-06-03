@echo off
setlocal

set PROJECT_DIR=C:\1booking
set FRONTEND_DIR=%PROJECT_DIR%\frontend

title Biometric Ticket Booking - Frontend

echo =============================================
echo  Biometric Ticket Booking - Frontend Starter
echo =============================================
echo.

if not exist "%FRONTEND_DIR%" (
    echo ERROR: Frontend folder not found: %FRONTEND_DIR%
    echo Please check that the project is extracted to C:\1booking
    pause
    exit /b 1
)

cd /d "%FRONTEND_DIR%"

if not exist "package.json" (
    echo ERROR: package.json not found in %FRONTEND_DIR%
    echo Make sure you are using the correct frontend folder.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo node_modules not found. Installing frontend dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        echo Make sure Node.js is installed and available in PATH.
        pause
        exit /b 1
    )
) else (
    echo Frontend dependencies found.
)

echo.
echo Frontend will run at:
echo   http://localhost:5173
echo.
echo Make sure backend is also running at:
echo   http://127.0.0.1:8000
echo.
echo Press CTRL+C to stop the frontend.
echo.

npm run dev

pause
