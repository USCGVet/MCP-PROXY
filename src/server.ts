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
  private server: Server;
  private chromeClient: Client | null = null;
  private httpTransport: StreamableHTTPServerTransport | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "mcp-chrome-proxy",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {
            // Declare that we support tools!
            // The actual tools will be provided by our handlers
          },
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
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

  private setupHandlers(): void {
    console.log("[Setup] Registering request handlers...");

    // List tools handler - forward to chrome client
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log("[Request] ========== ListTools REQUEST RECEIVED ==========");
      try {
        console.log("[Request] ListTools - Initializing chrome connection...");
        await this.initChromeConnection();

        if (!this.chromeClient) {
          throw new Error("Chrome client not initialized");
        }

        console.log("[Request] ListTools - Forwarding to chrome-devtools-mcp...");
        const result = await this.chromeClient.listTools();
        console.log("[Response] ListTools - Received from chrome-devtools-mcp:");
        console.log(JSON.stringify(result, null, 2));

        return result;
      } catch (error) {
        console.error("[Error] ListTools failed:", error);
        throw error;
      }
    });

    // Call tool handler - forward to chrome client
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log("[Request] ========== CallTool REQUEST RECEIVED ==========");
      try {
        await this.initChromeConnection();

        if (!this.chromeClient) {
          throw new Error("Chrome client not initialized");
        }

        console.log(`[Request] CallTool - ${request.params.name}`);
        console.log(`[Request] CallTool - Arguments:`, JSON.stringify(request.params.arguments, null, 2));

        const result = await this.chromeClient.callTool({
          name: request.params.name,
          arguments: request.params.arguments,
        });

        console.log(`[Response] CallTool - ${request.params.name} completed`);
        console.log(`[Response] CallTool - Result:`, JSON.stringify(result, null, 2));

        return result;
      } catch (error) {
        console.error(`[Error] CallTool ${request.params.name} failed:`, error);
        throw error;
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
      console.error("[MCP Error] Stack:", error.stack);
    };

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
      if (this.httpTransport) {
        await this.httpTransport.close();
        this.httpTransport = null;
      }

      if (this.chromeClient) {
        await this.chromeClient.close();
        this.chromeClient = null;
      }

      await this.server.close();
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
    } catch (error) {
      console.error("[Setup] WARNING: Failed to pre-initialize Chrome connection:", error);
      console.error("[Setup] Tools will be initialized on first request instead");
    }

    // Create single HTTP transport for all requests
    this.httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    // Connect transport to MCP server
    await this.server.connect(this.httpTransport);
    console.log("[Setup] HTTP transport connected to MCP server");

    // Verify handlers are callable by testing listTools directly
    console.log("[Setup] Testing if Chrome client listTools works...");
    try {
      const testTools = await this.chromeClient!.listTools();
      console.log(`[Setup] SUCCESS! Chrome client has ${testTools.tools.length} tools available`);
      console.log(`[Setup] Sample tools:`, testTools.tools.slice(0, 3).map((t: any) => t.name));
    } catch (error) {
      console.error("[Setup] ERROR testing Chrome client:", error);
    }

    const httpServer = http.createServer(async (req, res) => {
      // Log ALL incoming requests
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

      // Health check endpoint
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", chrome_url: CHROME_URL }));
        return;
      }

      // MCP endpoint - let transport handle everything
      if (req.url === "/mcp" || req.url?.startsWith("/mcp")) {
        console.log(`[${new Date().toISOString()}] Forwarding to HTTP transport...`);

        try {
          // Read request body if present
          let body: unknown = undefined;
          if (req.method === "POST" || req.method === "PUT") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk as Buffer);
            }
            const bodyText = Buffer.concat(chunks).toString();
            if (bodyText) {
              body = JSON.parse(bodyText);
              const method = (body as any)?.method;
              console.log(`[${new Date().toISOString()}] REQUEST: ${method}`);
              console.log(`[${new Date().toISOString()}] Full body:`, JSON.stringify(body, null, 2));
            }
          }

          // Let transport handle the request
          await this.httpTransport!.handleRequest(req, res, body);

          console.log(`[${new Date().toISOString()}] Request handled by transport`);
        } catch (error) {
          console.error("[Error] Failed to handle MCP request:", error);
          console.error("[Error] Stack:", (error as Error).stack);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Error handling MCP request");
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
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
