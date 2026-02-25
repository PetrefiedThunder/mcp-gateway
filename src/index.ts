#!/usr/bin/env node

/**
 * MCP Gateway — Enterprise infrastructure layer for MCP.
 * 
 * Sits between AI agents and MCP servers, providing:
 * - Authentication (API keys, JWT)
 * - Policy enforcement (RBAC, tool-level permissions)
 * - Audit logging (tamper-evident hash chain)
 * - Rate limiting
 * - Usage metering
 * - Secret injection
 * - Server lifecycle management
 * 
 * The gateway itself is an MCP server — agents connect to it via stdio
 * and it proxies calls to registered backend servers.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import { Gateway } from "./gateway.js";
import type { GatewayConfig } from "./types.js";

// Load config
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

  // Default minimal config
  return {
    auth: { type: "none" },
    servers: [],
    policies: [{ id: "default", name: "Allow all", roles: ["*"], rules: [{ action: "allow" }] }],
    audit: { enabled: true, storage: "sqlite", path: "./gateway-audit.db", hashChain: true },
    metering: { enabled: true, dimensions: ["calls", "latency", "errors"] },
    rateLimit: { enabled: true, defaultPerMinute: 60 },
  };
}

async function main() {
  const config = loadConfig();
  const gateway = new Gateway(config);

  // Start all registered backend servers
  await gateway.start();

  // Create the MCP server that agents connect to
  const server = new McpServer({
    name: "mcp-gateway",
    version: "1.0.0",
  });

  // --- Tool: call any registered tool through the gateway ---
  server.tool(
    "call",
    "Call a tool through the gateway (with auth, policy, audit, metering).",
    {
      tool: z.string().describe("Tool name to call"),
      args: z.string().default("{}").describe("Tool arguments as JSON string"),
      apiKey: z.string().optional().describe("API key for authentication"),
    },
    async ({ tool, args, apiKey }) => {
      const ctx = gateway.authenticate(apiKey);
      if (!ctx) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Authentication failed" }) }] };
      }

      const parsedArgs = JSON.parse(args);
      const result = await gateway.callTool(ctx, tool, parsedArgs);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Tool: list available tools ---
  server.tool(
    "list_tools",
    "List all tools available through the gateway (filtered by caller permissions).",
    {
      apiKey: z.string().optional(),
    },
    async ({ apiKey }) => {
      const ctx = gateway.authenticate(apiKey);
      if (!ctx) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Authentication failed" }) }] };
      }
      const tools = gateway.listTools(ctx);
      return { content: [{ type: "text" as const, text: JSON.stringify(tools, null, 2) }] };
    }
  );

  // --- Tool: list registered servers ---
  server.tool(
    "list_servers",
    "List all registered MCP servers and their status.",
    {},
    async () => {
      const servers = gateway.getRegisteredServers();
      return { content: [{ type: "text" as const, text: JSON.stringify(servers, null, 2) }] };
    }
  );

  // --- Tool: server health status ---
  server.tool(
    "server_status",
    "Get detailed status of all backend servers.",
    {},
    async () => {
      const status = gateway.getServerStatus();
      return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
    }
  );

  // --- Tool: query audit log ---
  server.tool(
    "audit_log",
    "Query the audit log of tool calls.",
    {
      consumerId: z.string().optional(),
      serverId: z.string().optional(),
      tool: z.string().optional(),
      status: z.enum(["success", "error", "denied", "rate-limited"]).optional(),
      from: z.string().optional().describe("Start time (ISO)"),
      to: z.string().optional().describe("End time (ISO)"),
      limit: z.number().min(1).max(1000).default(50),
    },
    async (opts) => {
      const entries = gateway.getAuditLog(opts);
      return { content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }] };
    }
  );

  // --- Tool: verify audit chain integrity ---
  server.tool(
    "audit_verify",
    "Verify the tamper-evident hash chain of the audit log.",
    {},
    async () => {
      const result = gateway.verifyAuditChain();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Tool: audit statistics ---
  server.tool(
    "audit_stats",
    "Get audit log statistics (total calls, by status, by server).",
    {},
    async () => {
      const stats = gateway.getAuditStats();
      return { content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }] };
    }
  );

  // --- Tool: usage metering ---
  server.tool(
    "usage",
    "Get usage metrics (calls, latency, errors) by consumer or server.",
    {
      consumerId: z.string().optional(),
    },
    async ({ consumerId }) => {
      const usage = gateway.getUsage(consumerId);
      return { content: [{ type: "text" as const, text: JSON.stringify(usage, null, 2) }] };
    }
  );

  // Connect MCP transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on("SIGINT", async () => { await gateway.stop(); process.exit(0); });
  process.on("SIGTERM", async () => { await gateway.stop(); process.exit(0); });
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
