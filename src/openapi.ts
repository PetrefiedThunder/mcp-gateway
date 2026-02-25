/**
 * OpenAPI 3.1 spec for the MCP Gateway HTTP API.
 */

export function generateOpenApiSpec(version = "1.0.0"): any {
  return {
    openapi: "3.1.0",
    info: {
      title: "MCP Gateway",
      description: "Enterprise infrastructure layer for Model Context Protocol. Auth, RBAC, audit, rate limiting, metering.",
      version,
      license: { name: "MIT" },
    },
    servers: [{ url: "http://localhost:3100", description: "Local gateway" }],
    security: [{ apiKey: [] }, { bearerAuth: [] }],
    paths: {
      "/mcp": {
        post: {
          summary: "MCP JSON-RPC endpoint",
          description: "Standard MCP protocol over HTTP. Send JSON-RPC requests (initialize, tools/list, tools/call).",
          tags: ["MCP"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/JsonRpcRequest" } } },
          },
          responses: {
            "200": { description: "JSON-RPC response", content: { "application/json": { schema: { $ref: "#/components/schemas/JsonRpcResponse" } } } },
            "401": { description: "Authentication required" },
            "403": { description: "Policy denied" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/api/health": {
        get: {
          summary: "Health check",
          tags: ["Management"],
          security: [],
          responses: { "200": { description: "Gateway health status" } },
        },
      },
      "/api/servers": {
        get: {
          summary: "List registered MCP servers",
          tags: ["Management"],
          responses: { "200": { description: "Server list with status and tools" } },
        },
      },
      "/api/tools": {
        get: {
          summary: "List available tools (filtered by caller permissions)",
          tags: ["Management"],
          responses: { "200": { description: "Tool list" } },
        },
      },
      "/api/audit": {
        get: {
          summary: "Query audit log",
          tags: ["Audit"],
          parameters: [
            { name: "consumerId", in: "query", schema: { type: "string" } },
            { name: "serverId", in: "query", schema: { type: "string" } },
            { name: "tool", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string", enum: ["success", "error", "denied", "rate-limited"] } },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000 } },
          ],
          responses: { "200": { description: "Audit log entries" } },
        },
      },
      "/api/audit/stats": {
        get: {
          summary: "Audit statistics",
          tags: ["Audit"],
          responses: { "200": { description: "Aggregated audit stats" } },
        },
      },
      "/api/audit/verify": {
        get: {
          summary: "Verify tamper-evident hash chain integrity",
          tags: ["Audit"],
          responses: { "200": { description: "Chain verification result" } },
        },
      },
      "/api/usage": {
        get: {
          summary: "Usage metrics",
          tags: ["Metering"],
          parameters: [{ name: "consumer", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Usage summary" } },
        },
      },
      "/metrics": {
        get: {
          summary: "Prometheus metrics",
          tags: ["Observability"],
          security: [],
          responses: { "200": { description: "Prometheus text format metrics", content: { "text/plain": {} } } },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        JsonRpcRequest: {
          type: "object",
          required: ["jsonrpc", "id", "method"],
          properties: {
            jsonrpc: { type: "string", const: "2.0" },
            id: { oneOf: [{ type: "string" }, { type: "integer" }] },
            method: { type: "string", enum: ["initialize", "tools/list", "tools/call"] },
            params: { type: "object" },
          },
        },
        JsonRpcResponse: {
          type: "object",
          properties: {
            jsonrpc: { type: "string", const: "2.0" },
            id: { oneOf: [{ type: "string" }, { type: "integer" }] },
            result: {},
            error: { type: "object", properties: { code: { type: "integer" }, message: { type: "string" } } },
          },
        },
      },
    },
  };
}
