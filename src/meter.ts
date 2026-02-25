import type { MeteringConfig, MeterEntry } from "./types.js";

interface MeterBucket {
  calls: number;
  errors: number;
  totalLatencyMs: number;
}

export class Meter {
  // key: "consumerId|serverId|tool|period"
  private buckets = new Map<string, MeterBucket>();
  private currentPeriod: string;
  private history: MeterEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private config: MeteringConfig) {
    this.currentPeriod = this.getPeriod();

    if (config.enabled) {
      const interval = config.flushIntervalMs || 60_000;
      this.flushInterval = setInterval(() => this.flush(), interval);
    }
  }

  private getPeriod(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}`;
  }

  record(consumerId: string, serverId: string, tool: string, latencyMs: number, isError: boolean) {
    if (!this.config.enabled) return;

    const period = this.getPeriod();
    if (period !== this.currentPeriod) {
      this.flush();
      this.currentPeriod = period;
    }

    const key = `${consumerId}|${serverId}|${tool}|${period}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { calls: 0, errors: 0, totalLatencyMs: 0 };
      this.buckets.set(key, bucket);
    }

    bucket.calls++;
    if (isError) bucket.errors++;
    bucket.totalLatencyMs += latencyMs;
  }

  flush() {
    for (const [key, bucket] of this.buckets) {
      const [consumerId, serverId, tool, period] = key.split("|");
      this.history.push({
        consumerId, serverId, tool,
        calls: bucket.calls, errors: bucket.errors, totalLatencyMs: bucket.totalLatencyMs,
        periodStart: period + ":00:00.000Z",
        periodEnd: period + ":59:59.999Z",
      });
    }
    this.buckets.clear();
  }

  getUsage(opts?: {
    consumerId?: string;
    serverId?: string;
    from?: string;
    to?: string;
  }): MeterEntry[] {
    // Include current unflushed data
    this.flush();

    let entries = [...this.history];
    if (opts?.consumerId) entries = entries.filter((e) => e.consumerId === opts.consumerId);
    if (opts?.serverId) entries = entries.filter((e) => e.serverId === opts.serverId);
    if (opts?.from) entries = entries.filter((e) => e.periodStart >= opts.from!);
    if (opts?.to) entries = entries.filter((e) => e.periodEnd <= opts.to!);

    return entries;
  }

  getSummary(consumerId?: string): {
    totalCalls: number;
    totalErrors: number;
    avgLatencyMs: number;
    byServer: Record<string, number>;
    byTool: Record<string, number>;
  } {
    const entries = this.getUsage(consumerId ? { consumerId } : undefined);
    let totalCalls = 0, totalErrors = 0, totalLatency = 0;
    const byServer: Record<string, number> = {};
    const byTool: Record<string, number> = {};

    for (const e of entries) {
      totalCalls += e.calls;
      totalErrors += e.errors;
      totalLatency += e.totalLatencyMs;
      byServer[e.serverId] = (byServer[e.serverId] || 0) + e.calls;
      byTool[e.tool] = (byTool[e.tool] || 0) + e.calls;
    }

    return {
      totalCalls, totalErrors,
      avgLatencyMs: totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0,
      byServer, byTool,
    };
  }

  stop() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flush();
  }
}
