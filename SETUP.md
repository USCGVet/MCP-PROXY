# MCP Chrome Proxy - Setup Guide

Complete setup instructions for running the MCP Chrome Proxy to enable WSL Claude Code access to Windows Chrome DevTools.

---

## Prerequisites

- **Windows 11** with WSL2 installed
- **Node.js** v18+ installed on Windows
- **Google Chrome** installed on Windows
- **Claude Code CLI** installed in WSL

---

## One-Time Setup

### 1. Install Dependencies

Open **PowerShell** or **Command Prompt** as Administrator:

```powershell
cd C:\HTML\MCP-Proxy
npm install
```

### 2. Create Firewall Rule for MCP Proxy

Allow incoming connections on port 3000 (so WSL can reach the proxy):

```powershell
New-NetFirewallRule -DisplayName "MCP Proxy" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### 3. Configure Claude Code in WSL

In your **WSL terminal**:

```bash
claude mcp add --transport http chrome-proxy http://172.18.128.1:3000/mcp
```

**Note:** If `172.18.128.1` doesn't work, find your Windows IP from WSL:
```bash
cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
```

---

## Daily Usage

Every time you want to use Chrome DevTools from WSL, follow these steps:

### Step 1: Start Chrome with Remote Debugging

Open **PowerShell**:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-profile-mcp"
```

**What this does:**
- Starts Chrome with DevTools Protocol enabled on port 9222
- Uses a separate profile (doesn't interfere with your regular Chrome)
- Binds to `localhost:9222` (Chrome's security requirement)

**Verify Chrome is running:**
```powershell
netstat -ano | findstr :9222
```

You should see Chrome listening on port 9222.

### Step 2: Start the MCP Proxy Server

In the same or a new **PowerShell** window:

**Option A: Use the launcher script**
```powershell
cd C:\HTML\MCP-Proxy
.\start.bat
```

**Option B: Use npm**
```powershell
cd C:\HTML\MCP-Proxy
npm start
```

**Expected output:**
```
[Setup] Registering request handlers...
[Setup] Pre-initializing Chrome connection...
[Chrome] Spawning chrome-devtools-mcp process...
[Chrome] Successfully connected to chrome-devtools-mcp
[Setup] SUCCESS! Chrome client has 26 tools available
============================================================
MCP Chrome Proxy Server Started
============================================================
[Server] Listening on: http://0.0.0.0:3000
[Ready] Waiting for connections...
```

### Step 3: Use from WSL

In your **WSL terminal**:

```bash
claude
```

Then try:
```
Navigate to https://example.com
```

Or:
```
Take a screenshot of the page
```

---

## Verification Steps

### 1. Test Chrome DevTools is Accessible

From **PowerShell**:
```powershell
Invoke-WebRequest -Uri http://localhost:9222/json/version | Select-Object -ExpandProperty Content
```

Should return JSON with Chrome version info.

### 2. Test MCP Proxy Health

From **WSL**:
```bash
curl http://172.18.128.1:3000/health
```

Should return:
```json
{"status":"ok","chrome_url":"http://localhost:9222"}
```

### 3. Test MCP Connection

From **WSL**:
```bash
claude mcp list
```

Should show:
```
chrome-proxy: http://172.18.128.1:3000/mcp (HTTP) - ✓ Connected
```

---

## Available Chrome DevTools Tools

Once connected, Claude Code can use these 26 tools:

### Page Management
- `list_pages` - List all open tabs
- `select_page` - Switch to a specific tab
- `new_page` - Open new tab with URL
- `close_page` - Close a tab
- `navigate_page` - Go to URL, back, forward, reload
- `resize_page` - Resize browser window

### Page Interaction
- `take_snapshot` - Get page structure with element UIDs
- `take_screenshot` - Capture visual screenshot
- `click` - Click elements
- `fill` - Type into inputs
- `fill_form` - Fill multiple fields
- `hover` - Hover over elements
- `drag` - Drag and drop
- `press_key` - Keyboard input
- `upload_file` - File uploads
- `wait_for` - Wait for text to appear
- `handle_dialog` - Handle alerts/confirms

### Developer Tools
- `list_network_requests` - See all HTTP requests
- `get_network_request` - Get request details
- `list_console_messages` - View console logs
- `get_console_message` - Get specific log
- `evaluate_script` - Run JavaScript

### Performance
- `performance_start_trace` - Start profiling
- `performance_stop_trace` - Stop profiling
- `performance_analyze_insight` - Analyze metrics

### Testing
- `emulate` - Throttle CPU/network

---

## Troubleshooting

### Chrome Not Responding

**Problem:** MCP proxy can't connect to Chrome

**Solution:**
1. Verify Chrome is running:
   ```powershell
   netstat -ano | findstr :9222
   ```

2. Kill all Chrome instances and restart:
   ```powershell
   taskkill /F /IM chrome.exe
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-profile-mcp"
   ```

3. Test Chrome directly:
   ```powershell
   Invoke-WebRequest -Uri http://localhost:9222/json/version
   ```

### WSL Can't Reach Proxy

**Problem:** `claude mcp list` shows "Failed to connect"

**Solution:**
1. Verify proxy is running on Windows
2. Test from WSL:
   ```bash
   curl http://172.18.128.1:3000/health
   ```

3. If that fails, check Windows IP:
   ```bash
   cat /etc/resolv.conf | grep nameserver
   ```

4. Check Windows Firewall allows port 3000:
   ```powershell
   Get-NetFirewallRule -DisplayName "MCP Proxy"
   ```

### Port 3000 Already in Use

**Problem:** Server won't start, says port in use

**Solution:**
1. Find what's using it:
   ```powershell
   netstat -ano | findstr :3000
   ```

2. Either kill that process or use a different port:
   ```powershell
   $env:PORT=8080
   npm start
   ```

   Then update WSL config:
   ```bash
   claude mcp remove chrome-proxy
   claude mcp add --transport http chrome-proxy http://172.18.128.1:8080/mcp
   ```

### Dependencies Out of Date

**Problem:** npm errors or MCP protocol errors

**Solution:**
```powershell
cd C:\HTML\MCP-Proxy
rm -r node_modules
rm package-lock.json
npm install
```

---

## What NOT to Do (Lessons Learned)

### ❌ Don't Use These Chrome Flags

These don't solve the problem and weaken security:
```powershell
# DON'T DO THIS:
--remote-debugging-address=0.0.0.0  # Doesn't help
--remote-allow-origins=*            # Doesn't help
--disable-web-security              # Dangerous and unnecessary
```

**Why:** Chrome's DevTools Protocol will only accept localhost connections regardless of these flags. The MCP proxy solves this properly.

### ❌ Don't Use Port Forwarding

This was attempted but isn't needed:
```powershell
# DON'T DO THIS:
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=127.0.0.1
```

**Why:** The MCP proxy already handles the localhost requirement internally.

### ❌ Don't Create Firewall Rules for Port 9222

```powershell
# DON'T DO THIS:
New-NetFirewallRule -DisplayName "WSL Chrome DevTools" -Direction Inbound -LocalPort 9222 -Protocol TCP -Action Allow
```

**Why:** Chrome only accepts connections from localhost. WSL should connect to the proxy on port 3000, not Chrome directly.

---

## Architecture Overview

```
┌─────────────────────┐
│   WSL Ubuntu        │
│                     │
│   Claude Code CLI   │
│   (172.18.128.140)  │
└──────────┬──────────┘
           │ HTTP
           │ POST /mcp
           ▼
┌─────────────────────┐
│   Windows 11        │
│                     │
│  MCP Proxy Server   │
│  (0.0.0.0:3000)     │
│         │           │
│         ▼           │
│  chrome-devtools-   │
│  mcp (subprocess)   │
│         │           │
│         ▼           │
│  Chrome DevTools    │
│  (localhost:9222)   │
└─────────────────────┘
```

**Key Points:**
- WSL connects to **proxy** at `172.18.128.1:3000` (Windows host IP)
- Proxy runs **on Windows** so it can access `localhost:9222`
- Chrome only accepts connections from **localhost** (security)
- Proxy forwards MCP requests via `chrome-devtools-mcp` subprocess

---

## Shutdown

### Stop MCP Proxy
Press `Ctrl+C` in the PowerShell window running the proxy.

### Stop Chrome
Close the Chrome window or:
```powershell
taskkill /F /IM chrome.exe
```

---

## Environment Variables (Optional)

Create a `.env` file (copy from `.env.example`):

```env
# Port for MCP proxy (default: 3000)
PORT=3000

# Bind address (default: 0.0.0.0)
HOST=0.0.0.0

# Chrome DevTools URL (default: http://localhost:9222)
CHROME_URL=http://localhost:9222
```

Then start the server and it will use these settings.

---

## Updating

To update to the latest version:

```powershell
cd C:\HTML\MCP-Proxy
git pull  # if using git
npm install
npm start
```

---

## Support

If you encounter issues:

1. Check the Windows proxy terminal for error messages
2. Run verification steps above
3. Review troubleshooting section
4. Check that Chrome and the proxy are both running
5. Verify WSL can reach `172.18.128.1:3000`

---

## Summary

**The Simple Version:**

1. Start Chrome: `chrome.exe --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-profile-mcp"`
2. Start Proxy: `npm start` in `C:\HTML\MCP-Proxy`
3. Use from WSL: `claude` then ask it to control Chrome

That's it! No port forwarding, no special flags, just the proxy doing its job.
