#!/usr/bin/env node

/**
 * Start the MCP Gateway as an HTTP server.
 * 
 * Usage:
 *   mcp-gateway-http                    # default port 3100
 *   MCP_GATEWAY_PORT=8080 mcp-gateway-http
 */

import { readFileSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import { Gateway } from "./gateway.js";
import { createHttpServer } from "./http.js";
import type { GatewayConfig } from "./types.js";

function loadConfig(): GatewayConfig {
  const paths = [
    process.env.MCP_GATEWAY_CONFIG,
    "./gateway.yaml",
    "./gateway.yml",
    "./gateway.json",
  ].filter(Boolean);

  for (const p of paths) {
    if (p && existsSync(p)) {
      const raw = readFileSync(p, "utf-8");
      if (p.endsWith(".json")) return JSON.parse(raw);
      return parseYaml(raw);
    }
  }

  return {
    auth: { type: "none" },
    servers: [],
    policies: [{ id: "default", name: "Allow all", roles: ["*"], rules: [{ action: "allow" }] }],
    audit: { enabled: true, storage: "sqlite", path: "./gateway-audit.db", hashChain: true },
    metering: { enabled: true, dimensions: ["calls", "latency", "errors"] },
    rateLimit: { enabled: true, defaultPerMinute: 120 },
  };
}

async function main() {
  const config = loadConfig();
  const gateway = new Gateway(config);

  console.log("[gateway] Starting backend servers...");
  await gateway.start();

  const port = parseInt(process.env.MCP_GATEWAY_PORT || String(config.port || 3100));
  const host = config.host || "0.0.0.0";

  const httpServer = createHttpServer(gateway, config);
  httpServer.listen(port, host, () => {
    console.log(`[gateway] HTTP server listening on http://${host}:${port}`);
    console.log(`[gateway] MCP endpoint:    POST http://${host}:${port}/mcp`);
    console.log(`[gateway] Management API:  GET  http://${host}:${port}/api/health`);
    console.log(`[gateway] Audit log:       GET  http://${host}:${port}/api/audit`);

    const servers = gateway.getRegisteredServers();
    console.log(`[gateway] ${servers.length} servers registered, ${servers.filter(s => s.status === "running").length} running`);
  });

  process.on("SIGINT", async () => {
    console.log("\n[gateway] Shutting down...");
    httpServer.close();
    await gateway.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    httpServer.close();
    await gateway.stop();
    process.exit(0);
  });
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
