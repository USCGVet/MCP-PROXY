#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "http";
import { randomUUID } from "crypto";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || "0.0.0.0";
const CHROME_URL = process.env.CHROME_URL || "http://localhost:9222";

// Create a wrapper MCP server that will expose the chrome-devtools-mcp functionality
class ChromeProxyServer {
  private chromeClient: Client | null = null;
  private activeSessions: Map<string, { server: Server; transport: StreamableHTTPServerTransport }> = new Map();

  constructor() {
    this.setupErrorHandling();
  }

  private createServerForSession(sessionId: string): Server {
    console.log(`[Session] Creating new MCP server for session: ${sessionId}`);

    const server = new Server(
      {
        name: "mcp-chrome-proxy",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers(server);

    server.onerror = (error) => {
      console.error(`[Session ${sessionId}] MCP Error:`, error);
    };

    return server;
  }

  private async initChromeConnection(): Promise<void> {
    if (this.chromeClient) {
      return; // Already connected
    }

    try {
      console.log("[Chrome] Spawning chrome-devtools-mcp process...");

      // Create MCP client to communicate with chrome-devtools-mcp
      this.chromeClient = new Client(
        {
          name: "chrome-proxy-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Let StdioClientTransport spawn the process
      const transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", "chrome-devtools-mcp", CHROME_URL],
      });

      await this.chromeClient.connect(transport);
      console.log("[Chrome] Successfully connected to chrome-devtools-mcp");
    } catch (error) {
      console.error("[Chrome] Failed to connect:", error);
      throw error;
    }
  }

  private setupHandlers(server: Server): void {
    // Track if this specific server instance has been initialized
    let serverInitialized = false;

    // Intercept initialize to track state
    const originalSetRequestHandler = server.setRequestHandler.bind(server);

    // List tools handler - forward to chrome client
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log("[Request] ListTools - Forwarding to chrome-devtools-mcp...");
      try {
        await this.initChromeConnection();

        if (!this.chromeClient) {
          throw new Error("Chrome client not initialized");
        }

        const result = await this.chromeClient.listTools();
        console.log(`[Response] ListTools - ${result.tools.length} tools available`);

        return result;
      } catch (error) {
        console.error("[Error] ListTools failed:", error);
        throw error;
      }
    });

    // Call tool handler - forward to chrome client
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log(`[Request] CallTool - ${request.params.name}`);
      try {
        await this.initChromeConnection();

        if (!this.chromeClient) {
          throw new Error("Chrome client not initialized");
        }

        const result = await this.chromeClient.callTool({
          name: request.params.name,
          arguments: request.params.arguments,
        });

        console.log(`[Response] CallTool - ${request.params.name} completed`);

        return result;
      } catch (error) {
        console.error(`[Error] CallTool ${request.params.name} failed:`, error);
        throw error;
      }
    });
  }

  private setupErrorHandling(): void {
    process.on("SIGINT", async () => {
      console.log("\n[Shutdown] Received SIGINT, shutting down gracefully...");
      await this.cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n[Shutdown] Received SIGTERM, shutting down gracefully...");
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup(): Promise<void> {
    try {
      // Clean up all active sessions
      for (const [sessionId, session] of this.activeSessions.entries()) {
        console.log(`[Shutdown] Closing session: ${sessionId}`);
        try {
          await session.transport.close();
          await session.server.close();
        } catch (err) {
          console.error(`[Shutdown] Error closing session ${sessionId}:`, err);
        }
      }
      this.activeSessions.clear();

      if (this.chromeClient) {
        await this.chromeClient.close();
        this.chromeClient = null;
      }

      console.log("[Shutdown] Cleanup completed");
    } catch (error) {
      console.error("[Shutdown] Error during cleanup:", error);
    }
  }

  async startHTTP(): Promise<void> {
    // Initialize Chrome connection BEFORE accepting HTTP requests
    console.log("[Setup] Pre-initializing Chrome connection...");
    try {
      await this.initChromeConnection();
      console.log("[Setup] Chrome connection pre-initialized successfully");

      // Verify Chrome connection
      const testTools = await this.chromeClient!.listTools();
      console.log(`[Setup] SUCCESS! Chrome client has ${testTools.tools.length} tools available`);
      console.log(`[Setup] Sample tools:`, testTools.tools.slice(0, 3).map((t: any) => t.name));
    } catch (error) {
      console.error("[Setup] WARNING: Failed to pre-initialize Chrome connection:", error);
      console.error("[Setup] Tools will be initialized on first request instead");
    }

    const httpServer = http.createServer(async (req, res) => {
      const requestId = randomUUID().slice(0, 8);

      // Log ALL incoming requests
      console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

      // Track connection lifecycle
      req.on('close', () => {
        console.log(`[${new Date().toISOString()}] [${requestId}] Request connection closed`);
      });

      req.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] [${requestId}] Request error:`, err.message);
      });

      res.on('close', () => {
        console.log(`[${new Date().toISOString()}] [${requestId}] Response connection closed`);
      });

      res.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] [${requestId}] Response error:`, err.message);
      });

      // Set keepalive to prevent connection timeouts
      req.socket.setKeepAlive(true, 60000); // 60 second keepalive

      // Health check endpoint
      if (req.url === "/health") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify({
          status: "ok",
          chrome_url: CHROME_URL,
          chrome_connected: this.chromeClient !== null,
          tools_available: this.chromeClient ? true : false
        }));
        return;
      }

      // MCP endpoint - recreate server after SSE disconnects
      if (req.url === "/mcp" || req.url?.startsWith("/mcp")) {
        console.log(`[${new Date().toISOString()}] [${requestId}] MCP request: ${req.method} ${req.url}`);

        try {
          // Add CORS headers
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");

          // Handle OPTIONS
          if (req.method === "OPTIONS") {
            console.log(`[${new Date().toISOString()}] [${requestId}] OPTIONS preflight`);
            res.writeHead(200);
            res.end();
            return;
          }

          // Get or create session
          const sharedSessionId = "http-shared";
          let session = this.activeSessions.get(sharedSessionId);

          if (!session) {
            console.log(`[${new Date().toISOString()}] [${requestId}] Creating new MCP transport+server`);

            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
            });

            const server = this.createServerForSession(sharedSessionId);
            await server.connect(transport);

            session = { server, transport };
            this.activeSessions.set(sharedSessionId, session);
          }

          // For GET requests (SSE), set up cleanup when connection closes
          if (req.method === "GET") {
            const cleanupSession = () => {
              console.log(`[${new Date().toISOString()}] [${requestId}] SSE disconnected, will recreate server for next client`);
              // Set a small delay to allow any in-flight requests to complete
              setTimeout(async () => {
                const sess = this.activeSessions.get(sharedSessionId);
                if (sess) {
                  console.log(`[${new Date().toISOString()}] Cleaning up session after SSE disconnect`);
                  this.activeSessions.delete(sharedSessionId);
                  try {
                    await sess.transport.close();
                    await sess.server.close();
                  } catch (err) {
                    console.error("Error cleaning up session:", err);
                  }
                }
              }, 100);
            };

            res.on('close', cleanupSession);
            res.on('finish', cleanupSession);
          }

          // Forward request to transport
          console.log(`[${new Date().toISOString()}] [${requestId}] Forwarding to transport`);
          await session.transport.handleRequest(req, res);
          console.log(`[${new Date().toISOString()}] [${requestId}] Request handled`);

        } catch (error) {
          console.error(`[${new Date().toISOString()}] [${requestId}] ERROR:`, error);

          if (!res.headersSent) {
            res.writeHead(500, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            });
            res.end(JSON.stringify({
              error: "Internal server error",
              message: error instanceof Error ? error.message : String(error),
              requestId: requestId
            }));
          }
        }
        return;
      }

      // 404 for all other requests
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found. Use /mcp for MCP endpoint or /health for status");
    });

    httpServer.listen(PORT, HOST, () => {
      console.log("=".repeat(60));
      console.log("MCP Chrome Proxy Server Started");
      console.log("=".repeat(60));
      console.log(`[Server] Listening on: http://${HOST}:${PORT}`);
      console.log(`[Server] SSE Endpoint: http://${HOST}:${PORT}/mcp`);
      console.log(`[Server] Health Check: http://${HOST}:${PORT}/health`);
      console.log(`[Chrome] Connecting to: ${CHROME_URL}`);
      console.log("=".repeat(60));
      console.log("\n[Info] To configure Claude Code from WSL, run:");
      console.log(`  claude mcp add --transport http chrome-proxy http://172.18.128.1:${PORT}/mcp`);
      console.log("\n[Ready] Waiting for connections...\n");
    });

    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(`\n[Error] Port ${PORT} is already in use!`);
        console.error(`[Error] Please close the other application or set a different PORT environment variable.`);
      } else {
        console.error("[Error] Server error:", error);
      }
      process.exit(1);
    });
  }

  async startStdio(): Promise<void> {
    console.log("[Server] Starting in stdio mode...");

    // For stdio, create a single server since it's a persistent connection
    const server = this.createServerForSession("stdio");
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.log("[Server] Connected via stdio");
  }
}

// Main entry point
async function main() {
  try {
    const proxyServer = new ChromeProxyServer();

    // Check if we should use stdio or HTTP based on environment or arguments
    const useStdio = process.argv.includes("--stdio") || process.env.MCP_TRANSPORT === "stdio";

    if (useStdio) {
      await proxyServer.startStdio();
    } else {
      await proxyServer.startHTTP();
    }
  } catch (error) {
    console.error("[Fatal] Failed to start server:", error);
    process.exit(1);
  }
}

main();
