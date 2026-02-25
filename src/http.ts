/**
 * HTTP/SSE transport for the MCP Gateway.
 * 
 * Exposes the gateway as a REST API + SSE endpoint so agents can connect
 * over the network (not just stdio). Also serves a management API.
 * 
 * Endpoints:
 *   POST /mcp          — JSON-RPC MCP endpoint (standard MCP over HTTP)
 *   GET  /sse           — SSE stream for MCP notifications
 *   
 *   GET  /api/servers   — List registered servers
 *   GET  /api/tools     — List available tools
 *   GET  /api/audit     — Query audit log
 *   GET  /api/audit/stats — Audit statistics
 *   GET  /api/audit/verify — Verify hash chain
 *   GET  /api/usage     — Usage metrics
 *   GET  /api/health    — Health check
 *   
 *   POST /api/keys      — Create API key
 *   GET  /api/keys      — List API keys (admin only)
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { Gateway } from "./gateway.js";
import type { GatewayConfig, ConsumerContext } from "./types.js";

export function createHttpServer(gateway: Gateway, config: GatewayConfig) {
  const server = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    // Extract auth
    const apiKey = req.headers["x-api-key"] as string || 
                   req.headers.authorization?.replace("Bearer ", "") || 
                   url.searchParams.get("api_key") || undefined;

    try {
      // Health check (no auth)
      if (path === "/api/health") {
        return json(res, 200, {
          status: "ok",
          version: "1.0.0",
          servers: gateway.getServerStatus(),
          uptime: process.uptime(),
        });
      }

      // MCP JSON-RPC endpoint
      if (path === "/mcp" && req.method === "POST") {
        const body = await readBody(req);
        const rpc = JSON.parse(body);
        
        const ctx = gateway.authenticate(apiKey);
        if (!ctx) return json(res, 401, { error: "Authentication required" });

        if (rpc.method === "initialize") {
          return json(res, 200, {
            jsonrpc: "2.0", id: rpc.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: "mcp-gateway", version: "1.0.0" },
            },
          });
        }

        if (rpc.method === "tools/list") {
          const tools = gateway.listTools(ctx);
          return json(res, 200, {
            jsonrpc: "2.0", id: rpc.id,
            result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema || { type: "object", properties: {} } })) },
          });
        }

        if (rpc.method === "tools/call") {
          const { name, arguments: args } = rpc.params;
          const result = await gateway.callTool(ctx, name, args || {});
          if (result.denied) {
            return json(res, 403, { jsonrpc: "2.0", id: rpc.id, error: { code: -32600, message: result.error } });
          }
          if (result.rateLimited) {
            return json(res, 429, { jsonrpc: "2.0", id: rpc.id, error: { code: -32600, message: "Rate limit exceeded" } });
          }
          if (result.error) {
            return json(res, 200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32603, message: result.error } });
          }
          return json(res, 200, { jsonrpc: "2.0", id: rpc.id, result: result.result });
        }

        return json(res, 200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "Method not found" } });
      }

      // Management API (requires auth)
      if (path.startsWith("/api/")) {
        const ctx = gateway.authenticate(apiKey);
        if (!ctx) return json(res, 401, { error: "Authentication required. Pass X-API-Key header." });

        if (path === "/api/servers") {
          return json(res, 200, gateway.getRegisteredServers());
        }

        if (path === "/api/tools") {
          return json(res, 200, gateway.listTools(ctx));
        }

        if (path === "/api/audit") {
          const opts: any = {};
          for (const [k, v] of url.searchParams) opts[k] = v;
          if (opts.limit) opts.limit = parseInt(opts.limit);
          return json(res, 200, gateway.getAuditLog(opts));
        }

        if (path === "/api/audit/stats") {
          return json(res, 200, gateway.getAuditStats());
        }

        if (path === "/api/audit/verify") {
          return json(res, 200, gateway.verifyAuditChain());
        }

        if (path === "/api/usage") {
          const consumerId = url.searchParams.get("consumer") || undefined;
          return json(res, 200, gateway.getUsage(consumerId));
        }

        return json(res, 404, { error: "Not found" });
      }

      // Landing page
      if (path === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html><html><head><title>MCP Gateway</title></head><body>
          <h1>🔐 MCP Gateway</h1>
          <p>Enterprise infrastructure for Model Context Protocol</p>
          <h3>Endpoints</h3>
          <ul>
            <li><code>POST /mcp</code> — MCP JSON-RPC (agents connect here)</li>
            <li><code>GET /api/health</code> — Health check</li>
            <li><code>GET /api/servers</code> — List servers</li>
            <li><code>GET /api/tools</code> — List tools</li>
            <li><code>GET /api/audit</code> — Audit log</li>
            <li><code>GET /api/audit/stats</code> — Audit statistics</li>
            <li><code>GET /api/audit/verify</code> — Verify hash chain</li>
            <li><code>GET /api/usage</code> — Usage metrics</li>
          </ul>
          <p>Auth: pass <code>X-API-Key</code> header or <code>?api_key=</code> query param.</p>
        </body></html>`);
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
  });

  return server;
}

function json(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
