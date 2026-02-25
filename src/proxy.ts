import { ChildProcess } from "child_process";

/**
 * MCP JSON-RPC proxy. Sends a JSON-RPC request to an MCP server process
 * via stdin and reads the response from stdout.
 */
export class McpProxy {
  private pending = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private buffer = "";
  private requestId = 0;

  constructor(
    private process: ChildProcess,
    private timeoutMs: number = 30000,
  ) {
    this.process.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });
  }

  private processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this.handleMessage(msg);
      } catch {
        // Skip non-JSON lines (server stderr leaking, etc.)
      }
    }
  }

  private handleMessage(msg: any) {
    // JSON-RPC response
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
    // Notifications (no id) — could forward to client in future
  }

  async request(method: string, params?: any): Promise<any> {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timeout after ${this.timeoutMs}ms: ${method}`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.process.stdin!.write(msg);
    });
  }

  async initialize(): Promise<any> {
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-gateway", version: "1.0.0" },
    });
  }

  async listTools(): Promise<any[]> {
    const result = await this.request("tools/list", {});
    return result.tools || [];
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    return this.request("tools/call", { name, arguments: args });
  }

  destroy() {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Proxy destroyed"));
    }
    this.pending.clear();
  }
}
