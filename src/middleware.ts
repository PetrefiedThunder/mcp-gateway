/**
 * Request middleware chain — timeout enforcement, request ID tracking,
 * structured logging, and graceful shutdown coordination.
 */

import { randomUUID } from "crypto";

export interface RequestContext {
  requestId: string;
  startTime: number;
  consumerId?: string;
  serverId?: string;
  tool?: string;
  abortController: AbortController;
}

export class RequestTracker {
  private active = new Map<string, RequestContext>();
  private draining = false;

  /**
   * Start tracking a request. Returns context with abort controller.
   */
  start(timeoutMs = 30000): RequestContext {
    const ctx: RequestContext = {
      requestId: randomUUID(),
      startTime: Date.now(),
      abortController: new AbortController(),
    };

    this.active.set(ctx.requestId, ctx);

    // Enforce timeout
    const timer = setTimeout(() => {
      ctx.abortController.abort();
      this.active.delete(ctx.requestId);
    }, timeoutMs);

    // Clean up timer when request completes
    ctx.abortController.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });

    return ctx;
  }

  /**
   * Mark a request as complete.
   */
  complete(requestId: string) {
    const ctx = this.active.get(requestId);
    if (ctx) {
      ctx.abortController.abort(); // triggers timer cleanup
      this.active.delete(requestId);
    }
  }

  /**
   * Get count of active requests.
   */
  get activeCount(): number {
    return this.active.size;
  }

  /**
   * Start draining — reject new requests, wait for active ones.
   */
  async drain(maxWaitMs = 30000): Promise<void> {
    this.draining = true;
    const start = Date.now();

    while (this.active.size > 0 && Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 100));
    }

    // Force-abort remaining
    for (const [id, ctx] of this.active) {
      ctx.abortController.abort();
    }
    this.active.clear();
  }

  get isDraining(): boolean {
    return this.draining;
  }
}

/**
 * Structured JSON logger for gateway events.
 */
export class Logger {
  private level: "debug" | "info" | "warn" | "error";

  constructor(level = "info") {
    this.level = level as any;
  }

  private shouldLog(level: string): boolean {
    const levels = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private log(level: string, msg: string, meta?: Record<string, any>) {
    if (!this.shouldLog(level)) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...meta,
    };
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(JSON.stringify(entry));
  }

  debug(msg: string, meta?: Record<string, any>) { this.log("debug", msg, meta); }
  info(msg: string, meta?: Record<string, any>) { this.log("info", msg, meta); }
  warn(msg: string, meta?: Record<string, any>) { this.log("warn", msg, meta); }
  error(msg: string, meta?: Record<string, any>) { this.log("error", msg, meta); }

  /**
   * Log a completed request.
   */
  request(ctx: RequestContext, status: string, error?: string) {
    this.info("request", {
      requestId: ctx.requestId,
      consumerId: ctx.consumerId,
      serverId: ctx.serverId,
      tool: ctx.tool,
      status,
      latencyMs: Date.now() - ctx.startTime,
      error,
    });
  }
}
