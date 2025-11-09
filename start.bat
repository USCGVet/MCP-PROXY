@echo off
REM MCP Chrome Proxy Server Launcher
REM This script starts the MCP proxy server on Windows

echo ================================================
echo MCP Chrome Proxy Server
echo ================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Dependencies not found. Installing...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

REM Check if Chrome is running on port 9222
echo [INFO] Checking if Chrome is running on port 9222...
netstat -ano | findstr ":9222" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Chrome does not appear to be running on port 9222
    echo Please start Chrome with: chrome.exe --remote-debugging-port=9222
    echo.
    echo Press any key to start the server anyway, or Ctrl+C to exit...
    pause >nul
)

echo.
echo [INFO] Starting MCP Chrome Proxy Server...
echo.

REM Start the server
npm start

REM If the server exits, pause so we can see any error messages
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server exited with error code %ERRORLEVEL%
    pause
)
