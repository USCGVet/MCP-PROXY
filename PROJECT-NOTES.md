# MCP Chrome Proxy - Technical Overview

A comprehensive technical reference for the MCP Chrome DevTools proxy server.

---

## Project Overview

**Purpose:** HTTP/SSE proxy server that enables Model Context Protocol (MCP) clients to access Chrome DevTools Protocol across network boundaries.

**Key Innovation:** Bridges the gap between isolated network environments (such as WSL/Linux containers) and Chrome's localhost-only DevTools Protocol by running a proxy in Chrome's network context.

**Use Case:** Enables development tools, AI assistants, and automation frameworks running in one environment to control and debug Chrome running in another.

---

## Technical Problem

### Chrome's Security Model

Chrome DevTools Protocol has strict security requirements:
- Only accepts connections from `127.0.0.1` (localhost)
- Rejects all non-localhost connections regardless of configuration
- No command-line flags can bypass this security restriction

### Network Isolation Challenges

When working across network boundaries (WSL, containers, VMs, remote systems):
- `localhost` in one environment ≠ `localhost` in another
- Direct connections to Chrome's DevTools port are rejected
- The requesting client appears as a remote host to Chrome

### Why Common Solutions Fail

❌ **Chrome flags** (`--remote-debugging-address=0.0.0.0`) - Ignored by DevTools Protocol
❌ **CORS flags** (`--remote-allow-origins=*`) - Only affects web content, not DevTools
❌ **Security bypass** (`--disable-web-security`) - Dangerous and doesn't affect DevTools
❌ **Port forwarding** (netsh, iptables) - Chrome still checks source IP
❌ **Firewall rules** - Cannot override Chrome's localhost validation

**Root cause:** Chrome's DevTools Protocol enforces localhost-only connections at the application layer.

---

## Architectural Solution

### Design Pattern

The proxy runs in Chrome's local environment, establishing a trusted localhost connection. It then exposes this connection to remote clients via MCP over HTTP/SSE.

```
┌──────────────────────────────────────────────────────────────┐
│  Remote Environment (WSL/Container/VM)                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  MCP Client (Claude Code, Custom Tools, etc.)         │  │
│  │  - Sends MCP requests over HTTP                       │  │
│  └────────────────┬───────────────────────────────────────┘  │
└───────────────────┼──────────────────────────────────────────┘
                    │
                    │ HTTP POST to <HOST_IP>:3000/mcp
                    │ (Crosses network boundary)
                    ▼
┌──────────────────────────────────────────────────────────────┐
│  Chrome's Local Environment                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  MCP Chrome Proxy Server (Node.js)                     │  │
│  │  - Listens on 0.0.0.0:3000                            │  │
│  │  - Uses StreamableHTTPServerTransport                  │  │
│  │  - Forwards requests to chrome-devtools-mcp            │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │                                           │
│                   │ Spawns subprocess                         │
│                   ▼                                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  chrome-devtools-mcp (npm package)                     │  │
│  │  - Runs as stdio subprocess                            │  │
│  │  - Exposes Chrome DevTools tools via MCP              │  │
│  │  - Connects to localhost:9222 (trusted)                │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │                                           │
│                   │ DevTools Protocol (localhost only)        │
│                   ▼                                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Google Chrome                                         │  │
│  │  - Started with: --remote-debugging-port=9222          │  │
│  │  - Accepts ONLY localhost connections                  │  │
│  │  - Performs browser automation                         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Key Principle

The proxy satisfies Chrome's security requirement (localhost connection) while providing network accessibility (HTTP/SSE transport). Chrome trusts the proxy because it runs locally; remote clients trust the proxy because it provides standard MCP interface.

---

## Technical Implementation

### Technology Stack

**Runtime:** Node.js with TypeScript (ES2022, ESM modules)

**Core Dependencies:**
- `@modelcontextprotocol/sdk` v1.21.1
  - `StreamableHTTPServerTransport` - HTTP/SSE MCP server
  - `StdioClientTransport` - Subprocess communication
- `chrome-devtools-mcp` - Chrome DevTools integration

**Protocols:**
- HTTP/1.1 for requests
- Server-Sent Events (SSE) for streaming responses
- JSON-RPC 2.0 for MCP messages
- Chrome DevTools Protocol for browser control

### Project Structure

```
MCP-Proxy/
├── src/
│   └── server.ts              # Main proxy implementation
├── package.json               # Dependencies & scripts
├── tsconfig.json             # TypeScript configuration
├── start.bat                 # Windows launcher
├── README.md                 # User documentation
├── SETUP.md                  # Setup guide
├── PROJECT-NOTES.md          # This file
├── .env.example              # Configuration template
└── .gitignore               # Standard Node.js ignores
```

### Core Components

**1. Server Initialization**
- Pre-spawns `chrome-devtools-mcp` subprocess
- Validates Chrome connection (26 tools available)
- Creates `StreamableHTTPServerTransport` with session management
- Binds to `0.0.0.0:3000` for network access

**2. Request Handling**
- Receives JSON-RPC requests via HTTP POST
- Routes through `StreamableHTTPServerTransport`
- Maintains session state for SSE connections
- Forwards to MCP handlers

**3. Tool Forwarding**
- `listTools()` - Returns available Chrome DevTools tools
- `callTool()` - Executes tool via chrome-devtools-mcp subprocess
- Results stream back through SSE to client

**4. Session Management**
- Automatic UUID generation per client
- Connection state tracking
- Support for multiple concurrent clients

### Chrome DevTools Tools (26 Available)

**Page Management (6 tools)**
- `list_pages`, `select_page`, `new_page`, `close_page`, `navigate_page`, `resize_page`

**Page Interaction (11 tools)**
- `take_snapshot`, `take_screenshot`, `click`, `fill`, `fill_form`, `hover`, `drag`, `press_key`, `upload_file`, `wait_for`, `handle_dialog`

**Developer Tools (5 tools)**
- `list_network_requests`, `get_network_request`, `list_console_messages`, `get_console_message`, `evaluate_script`

**Performance (3 tools)**
- `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`

**Emulation (1 tool)**
- `emulate` - CPU throttling, network conditions

---

## Use Cases

### Development & Debugging
- Debug web applications from WSL/Linux environments
- Access Chrome console logs and network data programmatically
- Analyze performance metrics without leaving the terminal
- Capture screenshots and DOM snapshots during development

### Automated Testing
- Run browser tests from containerized CI/CD pipelines
- Verify UI behavior across network boundaries
- Generate test artifacts (screenshots, logs, traces)
- Full Chrome engine testing (not headless limitations)

### AI-Assisted Development
- Enable AI assistants to interact with browser state
- Natural language queries about page behavior
- Automated debugging assistance
- Context-aware development tools

### Browser Automation
- Web scraping with full JavaScript execution
- Form automation and testing
- Responsive design testing at different viewports
- Cross-environment automation workflows

---

## Configuration

### Environment Variables

```bash
PORT=3000                          # Server port
HOST=0.0.0.0                      # Bind address (allow remote)
CHROME_URL=http://localhost:9222  # Chrome DevTools URL
```

### Chrome Setup

Start Chrome with remote debugging:
```bash
chrome.exe --remote-debugging-port=9222
```

### Client Configuration

Add MCP server to client:
```bash
claude mcp add --transport http chrome-proxy http://<HOST_IP>:3000/mcp
```

---

## Security Considerations

### Network Exposure
- Server binds to `0.0.0.0` for network accessibility
- Should only be exposed to trusted networks
- Consider adding authentication for production use

### Chrome Security
- Chrome's localhost-only restriction remains enforced
- Proxy acts as trusted intermediary
- DevTools Protocol security intact

### Recommendations
- Use firewall rules to restrict access
- Run on private/internal networks only
- Consider VPN or SSH tunneling for remote access
- Add TLS/HTTPS for encrypted communication
- Implement API key authentication if needed

---

## Design Patterns & Best Practices

### MCP Proxy Pattern

This implementation demonstrates a general pattern for exposing stdio MCP servers over networks:

1. **Subprocess Wrapper** - Spawn stdio MCP server as child process
2. **Transport Bridge** - Use StreamableHTTPServerTransport for HTTP/SSE
3. **Request Forwarding** - Proxy MCP messages between transports
4. **Session Management** - Handle multiple concurrent connections

### Applicability to Other MCP Servers

This pattern works for **any** stdio MCP server:
- File system access servers
- Database query servers
- API integration servers
- Custom tool servers

**Formula:** `stdio MCP server + proxy pattern = network-accessible MCP API`

---

## Performance Characteristics

### Latency
- Local network: <100ms per request
- Subprocess communication: minimal overhead
- SSE streaming: real-time updates

### Resource Usage
- Memory: ~50MB (Node.js + subprocess)
- CPU: minimal (event-driven)
- Startup: ~2 seconds (including Chrome connection)

### Scalability
- Concurrent sessions: unlimited (SDK-managed)
- Chrome instance: single-threaded (Chrome limitation)
- Network: standard HTTP/SSE limits

---

## Extension Opportunities

### Enhanced Features
- **Authentication** - API keys, OAuth, JWT tokens
- **TLS/HTTPS** - Encrypted transport
- **Multi-Chrome** - Connect to multiple Chrome instances
- **Load Balancing** - Distribute across Chrome instances
- **Metrics & Logging** - Request tracking, analytics

### Broader Applications

**MCP Gateway Service**
- Central hub for team-shared MCP servers
- Expose multiple stdio servers via single endpoint
- Service discovery and routing

**Cloud Debugging Platform**
- Remote browser instances
- Distributed testing infrastructure
- Production debugging tools

**Containerized Development**
- Docker containers accessing host Chrome
- Kubernetes pod integration
- Cloud IDE browser access

---

## Implementation Notes

### Why StreamableHTTPServerTransport

Modern MCP SDK uses `StreamableHTTPServerTransport` (not deprecated `SSEServerTransport`):
- Proper request routing to handlers
- Built-in session management
- Automatic SSE streaming support
- Standard JSON-RPC 2.0 compliance

### Why HTTP/SSE Transport

- **HTTP** - Standard, firewall-friendly, widely supported
- **SSE** - Server-to-client streaming for real-time updates
- **JSON-RPC** - MCP protocol compatibility
- **Stateless** - Horizontal scaling possible

### Why Subprocess Pattern

- Reuse existing `chrome-devtools-mcp` implementation
- Clean separation of concerns
- Standard stdio MCP interface
- Automatic process lifecycle management

---

## Troubleshooting

### Common Issues

**Chrome Connection Failed**
- Verify Chrome running with `--remote-debugging-port=9222`
- Test: `curl http://localhost:9222/json/version`
- Check no other process using port 9222

**Network Connection Failed**
- Verify proxy listening on `0.0.0.0:3000`
- Check firewall allows inbound port 3000
- Test: `curl http://<HOST_IP>:3000/health`

**MCP Protocol Errors**
- Ensure MCP SDK version compatibility
- Update dependencies if needed
- Check client MCP implementation version

---

## Technical Specifications

### Supported MCP Features
- Tools: ✅ Full support (26 Chrome tools)
- Resources: ❌ Not applicable
- Prompts: ❌ Not applicable
- Sampling: ❌ Not applicable

### Protocol Compliance
- MCP Spec: Compatible with current specification
- JSON-RPC: 2.0 compliant
- Transport: HTTP + SSE (standard)

### Browser Support
- Chrome/Chromium: ✅ Full support
- Edge (Chromium): ✅ Compatible
- Firefox: ❌ Different protocol
- Safari: ❌ Different protocol

---

## Related Projects

### MCP Ecosystem
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Official protocol implementation
- [chrome-devtools-mcp](https://github.com/modelcontextprotocol/servers) - Chrome DevTools server

### Chrome DevTools
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) - Official documentation
- [Puppeteer](https://pptr.dev/) - Alternative Chrome automation

---

## License

MIT License - See LICENSE file for details

---

## Contributing

Contributions welcome for:
- Additional Chrome DevTools tool support
- Authentication mechanisms
- TLS/HTTPS support
- Performance optimizations
- Documentation improvements
- Bug fixes

---

## Summary

This project solves Chrome's localhost-only DevTools restriction by placing a proxy in Chrome's local environment. The proxy exposes Chrome's capabilities via MCP over HTTP/SSE, enabling remote clients to access DevTools functionality while respecting Chrome's security model.

The implementation provides a reusable pattern for bridging stdio MCP servers across network boundaries, applicable beyond Chrome DevTools to any stdio-based MCP server.
