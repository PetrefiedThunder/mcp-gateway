import { spawn, ChildProcess } from "child_process";
import type { ServerConfig } from "./types.js";

interface ManagedServer {
  config: ServerConfig;
  process: ChildProcess | null;
  tools: ToolInfo[];
  status: "stopped" | "starting" | "running" | "error";
  lastError?: string;
  startedAt?: Date;
  restarts: number;
}

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: any;
}

export class ServerRegistry {
  private servers = new Map<string, ManagedServer>();

  constructor(configs: ServerConfig[]) {
    for (const config of configs) {
      this.servers.set(config.id, {
        config,
        process: null,
        tools: [],
        status: "stopped",
        restarts: 0,
      });
    }
  }

  getServer(id: string): ManagedServer | undefined {
    return this.servers.get(id);
  }

  getAllServers(): ManagedServer[] {
    return Array.from(this.servers.values());
  }

  getEnabledServers(): ManagedServer[] {
    return this.getAllServers().filter((s) => s.config.enabled);
  }

  async startServer(id: string): Promise<ChildProcess> {
    const server = this.servers.get(id);
    if (!server) throw new Error(`Server ${id} not found`);
    if (!server.config.enabled) throw new Error(`Server ${id} is disabled`);

    if (server.process && server.status === "running") {
      return server.process;
    }

    server.status = "starting";

    const env = { ...process.env, ...server.config.env };

    const child = spawn(server.config.command, server.config.args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    server.process = child;
    server.startedAt = new Date();

    child.on("exit", (code) => {
      server.status = "stopped";
      server.process = null;
      if (code !== 0) {
        server.lastError = `Exited with code ${code}`;
        server.status = "error";
      }
    });

    child.on("error", (err) => {
      server.status = "error";
      server.lastError = err.message;
      server.process = null;
    });

    child.stderr?.on("data", (data: Buffer) => {
      server.lastError = data.toString().slice(-500);
    });

    // Wait a tiny bit for process to start
    await new Promise((r) => setTimeout(r, 100));

    if (server.status === "starting") {
      server.status = "running";
    }

    return child;
  }

  stopServer(id: string) {
    const server = this.servers.get(id);
    if (!server?.process) return;
    server.process.kill("SIGTERM");
    setTimeout(() => {
      if (server.process && !server.process.killed) {
        server.process.kill("SIGKILL");
      }
    }, 5000);
    server.status = "stopped";
    server.process = null;
  }

  stopAll() {
    for (const [id] of this.servers) {
      this.stopServer(id);
    }
  }

  registerTools(serverId: string, tools: ToolInfo[]) {
    const server = this.servers.get(serverId);
    if (server) server.tools = tools;
  }

  findServerForTool(toolName: string): ManagedServer | undefined {
    for (const server of this.servers.values()) {
      if (server.tools.some((t) => t.name === toolName)) return server;
    }
    return undefined;
  }

  listAllTools(): { serverId: string; tools: ToolInfo[] }[] {
    return this.getEnabledServers().map((s) => ({
      serverId: s.config.id,
      tools: s.tools,
    }));
  }

  getStatus(): Record<string, { status: string; tools: number; uptime?: number; lastError?: string }> {
    const result: Record<string, any> = {};
    for (const [id, server] of this.servers) {
      result[id] = {
        status: server.status,
        tools: server.tools.length,
        uptime: server.startedAt ? Date.now() - server.startedAt.getTime() : undefined,
        lastError: server.lastError,
      };
    }
    return result;
  }

  addServer(config: ServerConfig) {
    this.servers.set(config.id, {
      config, process: null, tools: [], status: "stopped", restarts: 0,
    });
  }

  removeServer(id: string) {
    this.stopServer(id);
    this.servers.delete(id);
  }
}
