import { Authenticator } from "./auth.js";
import { PolicyEngine } from "./policy.js";
import { AuditLog } from "./audit.js";
import { RateLimiter } from "./ratelimit.js";
import { Meter } from "./meter.js";
import { ServerRegistry } from "./registry.js";
import { McpProxy } from "./proxy.js";
import type { GatewayConfig, ConsumerContext } from "./types.js";

export class Gateway {
  private auth: Authenticator;
  private policy: PolicyEngine;
  private audit: AuditLog;
  private rateLimiter: RateLimiter;
  private meter: Meter;
  private registry: ServerRegistry;
  private proxies = new Map<string, McpProxy>();

  constructor(private config: GatewayConfig) {
    this.auth = new Authenticator(config.auth);
    this.policy = new PolicyEngine(config.policies);
    this.audit = new AuditLog(config.audit);
    this.rateLimiter = new RateLimiter(
      config.rateLimit?.defaultPerMinute || 60,
      config.rateLimit?.burstMultiplier || 2,
    );
    this.meter = new Meter(config.metering);
    this.registry = new ServerRegistry(config.servers);
  }

  /**
   * Authenticate a caller. Returns context or null.
   */
  authenticate(apiKey: string | undefined): ConsumerContext | null {
    return this.auth.authenticate(apiKey);
  }

  /**
   * Initialize all enabled servers and discover their tools.
   */
  async start(): Promise<void> {
    for (const server of this.registry.getEnabledServers()) {
      try {
        const proc = await this.registry.startServer(server.config.id);
        const proxy = new McpProxy(proc, server.config.timeout || 30000);
        this.proxies.set(server.config.id, proxy);

        // Initialize MCP handshake
        await proxy.initialize();

        // Discover tools
        const tools = await proxy.listTools();
        this.registry.registerTools(server.config.id, tools);

        console.log(`[gateway] Started ${server.config.id}: ${tools.length} tools`);
      } catch (err: any) {
        console.error(`[gateway] Failed to start ${server.config.id}: ${err.message}`);
      }
    }
  }

  /**
   * List all available tools (respecting policies for the caller).
   */
  listTools(ctx: ConsumerContext): { serverId: string; name: string; description?: string; inputSchema?: any }[] {
    const allTools = this.registry.listAllTools();
    const result: any[] = [];

    for (const { serverId, tools } of allTools) {
      for (const tool of tools) {
        const decision = this.policy.evaluate(ctx, serverId, tool.name);
        if (decision.allowed) {
          result.push({ serverId, name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
        }
      }
    }

    return result;
  }

  /**
   * Call a tool through the gateway pipeline:
   * Auth → Policy → Rate Limit → Proxy → Audit → Meter
   */
  async callTool(
    ctx: ConsumerContext,
    toolName: string,
    args: Record<string, any>,
  ): Promise<{ result?: any; error?: string; denied?: boolean; rateLimited?: boolean }> {
    const startTime = Date.now();

    // Find which server owns this tool
    const server = this.registry.findServerForTool(toolName);
    if (!server) {
      await this.audit.log({
        consumerId: ctx.consumerId, apiKeyId: ctx.apiKeyId,
        serverId: "unknown", tool: toolName,
        args: JSON.stringify(args), response: "", latencyMs: 0,
        status: "error", error: "Tool not found",
      });
      return { error: `Tool "${toolName}" not found in any registered server` };
    }

    const serverId = server.config.id;

    // Policy check
    const decision = this.policy.evaluate(ctx, serverId, toolName, args);
    if (!decision.allowed) {
      await this.audit.log({
        consumerId: ctx.consumerId, apiKeyId: ctx.apiKeyId,
        serverId, tool: toolName,
        args: JSON.stringify(args), response: "", latencyMs: 0,
        status: "denied", error: decision.reason,
      });
      return { denied: true, error: decision.reason };
    }

    // Rate limit check
    const rateKey = `${ctx.consumerId}:${serverId}`;
    const rateResult = this.rateLimiter.check(rateKey, ctx.rateLimit);
    if (!rateResult.allowed) {
      await this.audit.log({
        consumerId: ctx.consumerId, apiKeyId: ctx.apiKeyId,
        serverId, tool: toolName,
        args: JSON.stringify(args), response: "", latencyMs: 0,
        status: "rate-limited",
      });
      return { rateLimited: true, error: "Rate limit exceeded" };
    }

    // Execute through proxy
    const proxy = this.proxies.get(serverId);
    if (!proxy) {
      return { error: `Server "${serverId}" is not running` };
    }

    try {
      const result = await proxy.callTool(toolName, args);
      const latencyMs = Date.now() - startTime;

      // Audit
      await this.audit.log({
        consumerId: ctx.consumerId, apiKeyId: ctx.apiKeyId,
        serverId, tool: toolName,
        args: JSON.stringify(args),
        response: JSON.stringify(result).slice(0, 10000),
        latencyMs, status: "success",
      });

      // Meter
      this.meter.record(ctx.consumerId, serverId, toolName, latencyMs, false);

      return { result };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;

      await this.audit.log({
        consumerId: ctx.consumerId, apiKeyId: ctx.apiKeyId,
        serverId, tool: toolName,
        args: JSON.stringify(args), response: "",
        latencyMs, status: "error", error: err.message,
      });

      this.meter.record(ctx.consumerId, serverId, toolName, latencyMs, true);

      return { error: err.message };
    }
  }

  // --- Management API ---

  getAuditLog(opts?: Parameters<AuditLog["query"]>[0]) {
    return this.audit.query(opts || {});
  }

  verifyAuditChain() {
    return this.audit.verify();
  }

  getAuditStats() {
    return this.audit.stats();
  }

  getUsage(consumerId?: string) {
    return this.meter.getSummary(consumerId);
  }

  getServerStatus() {
    return this.registry.getStatus();
  }

  getRegisteredServers() {
    return this.registry.getAllServers().map((s) => ({
      id: s.config.id, name: s.config.name, status: s.status,
      tools: s.tools.map((t) => t.name), tags: s.config.tags,
    }));
  }

  async stop() {
    for (const proxy of this.proxies.values()) {
      proxy.destroy();
    }
    this.proxies.clear();
    this.registry.stopAll();
    this.meter.stop();
    this.audit.close();
  }
}
