# ============================================================
#  Start Chrome with Remote Debugging for MCP Proxy
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Starting Chrome with DevTools Protocol" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Chrome is already running on port 9222
$portInUse = netstat -ano | Select-String ":9222"
if ($portInUse) {
    Write-Host "[Warning] Port 9222 is already in use!" -ForegroundColor Yellow
    Write-Host "[Info] Chrome may already be running with remote debugging." -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit
    }
}

# Set Chrome executable path
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

# Check if Chrome exists
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}

if (-not (Test-Path $chromePath)) {
    Write-Host "[Error] Chrome not found at common locations:" -ForegroundColor Red
    Write-Host "  - C:\Program Files\Google\Chrome\Application\chrome.exe"
    Write-Host "  - C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    Write-Host ""
    Write-Host "Please edit this script and set `$chromePath to your Chrome location."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Set profile directory
$profileDir = "$env:TEMP\chrome-profile-mcp"

Write-Host "[Chrome] Executable: $chromePath" -ForegroundColor Green
Write-Host "[Chrome] Profile: $profileDir" -ForegroundColor Green
Write-Host "[Chrome] Debug Port: 9222" -ForegroundColor Green
Write-Host ""
Write-Host "[Starting] Chrome with DevTools Protocol enabled..." -ForegroundColor Yellow
Write-Host ""

# Start Chrome with remote debugging
& $chromePath --remote-debugging-port=9222 --user-data-dir="$profileDir"
