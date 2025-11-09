# MCP Chrome Proxy Server

A proxy MCP server that bridges WSL and Windows Chrome DevTools, enabling Claude Code CLI in WSL to control Chrome running on Windows.

## Problem Solved

Chrome's DevTools protocol only accepts connections from `localhost` (127.0.0.1) for security reasons. When running Claude Code CLI in WSL (Windows Subsystem for Linux), you cannot directly connect to Chrome running on Windows at `localhost:9222` because WSL's network is isolated.

This proxy server solves the problem by:
1. Running on Windows (where it can access Chrome's `localhost:9222`)
2. Exposing an MCP server on `0.0.0.0:3000` (accessible from WSL)
3. Forwarding all Chrome DevTools tool calls between WSL and Windows Chrome

## Architecture

```
WSL Ubuntu                 Windows 11
┌─────────────────┐       ┌──────────────────────────┐
│ Claude Code CLI │       │  MCP Proxy Server        │
│                 │──────▶│  (0.0.0.0:3000)          │
│ HTTP: 172.18... │       │         │                │
└─────────────────┘       │         ▼                │
                          │  chrome-devtools-mcp     │
                          │         │                │
                          │         ▼                │
                          │  Chrome (localhost:9222) │
                          └──────────────────────────┘
```

## Requirements

- **Windows 11** with WSL2
- **Node.js** (v18 or higher) installed on Windows
- **Chrome** running on Windows with remote debugging enabled
- **Claude Code CLI** running in WSL

## Installation

### 1. Install Dependencies

Open **PowerShell** or **Command Prompt** on Windows and navigate to this directory:

```bash
cd C:\HTML\MCP-Proxy
npm install
```

### 2. Start Chrome with Remote Debugging

Start Chrome on Windows with the remote debugging flag:

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Or create a shortcut with this flag added to the target.

**Verify Chrome is running:**
```bash
netstat -ano | findstr ":9222"
```

You should see Chrome listening on port 9222.

### 3. Start the Proxy Server

**Option A: Use the launcher script** (Recommended)
```bash
start.bat
```

**Option B: Use npm**
```bash
npm start
```

**Option C: Manual start**
```bash
npm run build
node dist/server.js
```

You should see:
```
============================================================
MCP Chrome Proxy Server Started
============================================================
[Server] Listening on: http://0.0.0.0:3000
[Server] SSE Endpoint: http://0.0.0.0:3000/mcp
[Server] Health Check: http://0.0.0.0:3000/health
[Chrome] Connecting to: http://localhost:9222
============================================================

[Info] To configure Claude Code from WSL, run:
  claude mcp add --transport http chrome-proxy http://172.18.128.1:3000/mcp

[Ready] Waiting for connections...
```

### 4. Configure Claude Code in WSL

In your WSL terminal, add the proxy server as an MCP server:

```bash
claude mcp add --transport http chrome-proxy http://172.18.128.1:3000/mcp
```

**Note:** `172.18.128.1` is the default Windows host IP from WSL2. If your setup is different, find your Windows IP from WSL using:
```bash
cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
```

### 5. Verify Connection

Test the health endpoint from WSL:
```bash
curl http://172.18.128.1:3000/health
```

You should see:
```json
{"status":"ok","chrome_url":"http://localhost:9222"}
```

## Usage

Once configured, you can use Chrome DevTools commands in Claude Code CLI from WSL:

```
> Navigate to youtube

> Take a screenshot

> Click on the search box

> Fill the search box with "MCP servers"

> List all pages
```

## Available Chrome DevTools Tools

The proxy exposes all 26 tools from `chrome-devtools-mcp`:

### Navigation
- `navigate_page` - Navigate to URL, back, forward, or reload
- `new_page` - Open a new browser tab
- `close_page` - Close a browser tab
- `list_pages` - List all open tabs
- `select_page` - Switch to a specific tab
- `wait_for` - Wait for text to appear on page

### Input Automation
- `click` - Click on an element
- `drag` - Drag and drop elements
- `fill` - Fill input fields
- `fill_form` - Fill multiple form fields at once
- `handle_dialog` - Handle browser dialogs (alerts, confirms)
- `hover` - Hover over elements
- `press_key` - Press keyboard keys
- `upload_file` - Upload files through file inputs

### Inspection & Debugging
- `take_snapshot` - Take a text snapshot of the page
- `take_screenshot` - Take a screenshot
- `evaluate_script` - Run JavaScript in the page
- `list_console_messages` - List console messages
- `get_console_message` - Get a specific console message
- `list_network_requests` - List network requests
- `get_network_request` - Get details of a network request

### Emulation & Performance
- `emulate` - Emulate mobile devices, network conditions
- `resize_page` - Resize the browser window
- `performance_start_trace` - Start performance profiling
- `performance_stop_trace` - Stop performance profiling
- `performance_analyze_insight` - Analyze performance insights

## Configuration

### Environment Variables

You can customize the proxy server using environment variables:

- `PORT` - Server port (default: `3000`)
- `HOST` - Bind address (default: `0.0.0.0`)
- `CHROME_URL` - Chrome DevTools URL (default: `http://localhost:9222`)

**Example:**
```bash
set PORT=8080
set CHROME_URL=http://localhost:9222
npm start
```

### Custom Chrome Port

If Chrome is running on a different port:

```bash
set CHROME_URL=http://localhost:9223
npm start
```

## Troubleshooting

### Chrome Connection Issues

**Problem:** `[Chrome] Failed to connect`

**Solutions:**
1. Verify Chrome is running with `--remote-debugging-port=9222`:
   ```bash
   netstat -ano | findstr ":9222"
   ```

2. Close all Chrome instances and restart with the flag:
   ```bash
   taskkill /F /IM chrome.exe
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```

3. Try accessing Chrome DevTools manually:
   - Open browser and go to `http://localhost:9222/json`
   - You should see a JSON list of pages

### WSL Connection Issues

**Problem:** Cannot connect from WSL to Windows

**Solutions:**
1. Find your Windows IP from WSL:
   ```bash
   cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
   ```

2. Test connectivity:
   ```bash
   curl http://<WINDOWS_IP>:3000/health
   ```

3. Check Windows Firewall:
   - Open Windows Defender Firewall
   - Allow Node.js through the firewall
   - Or temporarily disable firewall to test

4. Ensure the server is binding to `0.0.0.0`, not `127.0.0.1`

### Port Already in Use

**Problem:** `[Error] Port 3000 is already in use!`

**Solutions:**
1. Find what's using the port:
   ```bash
   netstat -ano | findstr ":3000"
   ```

2. Kill the process or use a different port:
   ```bash
   set PORT=8080
   npm start
   ```

### Dependencies Not Installing

**Problem:** `npm install` fails

**Solutions:**
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete `node_modules` and try again:
   ```bash
   rmdir /s /q node_modules
   npm install
   ```

3. Update npm:
   ```bash
   npm install -g npm@latest
   ```

## Development

### Project Structure

```
C:\HTML\MCP-Proxy\
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── start.bat             # Windows launcher script
├── README.md             # This file
├── src/
│   └── server.ts         # Main proxy server implementation
└── dist/                 # Compiled JavaScript (generated)
    └── server.js
```

### Building

```bash
npm run build
```

### Running in Development

```bash
npm run dev
```

### Code Overview

The proxy server (`src/server.ts`) consists of:

1. **ChromeProxyServer Class**
   - Manages MCP server instance
   - Spawns `chrome-devtools-mcp` as subprocess
   - Forwards tool calls via MCP client

2. **HTTP/SSE Transport**
   - Listens on `0.0.0.0:3000`
   - Exposes `/mcp` endpoint for SSE connections
   - Provides `/health` endpoint for status checks

3. **Request Forwarding**
   - `listTools()` - Returns available Chrome tools
   - `callTool()` - Forwards tool execution to Chrome

## Security Considerations

- The server binds to `0.0.0.0` to allow WSL connections
- Only accept connections from trusted WSL instances
- Chrome DevTools has its own security via localhost-only binding
- Consider adding authentication if exposed to untrusted networks

## License

MIT

## Credits

- Built with [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
- Uses [chrome-devtools-mcp](https://github.com/modelcontextprotocol/servers/tree/main/src/chrome-devtools) for Chrome integration
- Created to solve WSL-Windows Chrome networking challenges
