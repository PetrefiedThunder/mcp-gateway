/**
 * Prometheus-compatible /metrics endpoint.
 * 
 * Exposes:
 * - mcp_gateway_requests_total (counter, by server/tool/status)
 * - mcp_gateway_request_duration_ms (histogram, by server/tool)
 * - mcp_gateway_active_servers (gauge)
 * - mcp_gateway_rate_limited_total (counter)
 * - mcp_gateway_auth_failures_total (counter)
 * - mcp_gateway_uptime_seconds (gauge)
 */

interface MetricCounter {
  labels: Record<string, string>;
  value: number;
}

export class Metrics {
  private counters = new Map<string, MetricCounter[]>();
  private histograms = new Map<string, { labels: Record<string, string>; sum: number; count: number; buckets: Map<number, number> }[]>();
  private gauges = new Map<string, number>();
  private startTime = Date.now();

  private static HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

  increment(name: string, labels: Record<string, string> = {}, value = 1) {
    if (!this.counters.has(name)) this.counters.set(name, []);
    const entries = this.counters.get(name)!;
    const existing = entries.find((e) => labelsMatch(e.labels, labels));
    if (existing) {
      existing.value += value;
    } else {
      entries.push({ labels, value });
    }
  }

  observe(name: string, labels: Record<string, string>, value: number) {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    const entries = this.histograms.get(name)!;
    let existing = entries.find((e) => labelsMatch(e.labels, labels));
    if (!existing) {
      existing = { labels, sum: 0, count: 0, buckets: new Map(Metrics.HISTOGRAM_BUCKETS.map((b) => [b, 0])) };
      entries.push(existing);
    }
    existing.sum += value;
    existing.count++;
    for (const bucket of Metrics.HISTOGRAM_BUCKETS) {
      if (value <= bucket) existing.buckets.set(bucket, (existing.buckets.get(bucket) || 0) + 1);
    }
  }

  gauge(name: string, value: number) {
    this.gauges.set(name, value);
  }

  // Record a tool call
  recordCall(serverId: string, tool: string, status: string, latencyMs: number) {
    this.increment("mcp_gateway_requests_total", { server: serverId, tool, status });
    this.observe("mcp_gateway_request_duration_ms", { server: serverId, tool }, latencyMs);
  }

  recordRateLimit() { this.increment("mcp_gateway_rate_limited_total"); }
  recordAuthFailure() { this.increment("mcp_gateway_auth_failures_total"); }
  setActiveServers(count: number) { this.gauge("mcp_gateway_active_servers", count); }

  /**
   * Render Prometheus text format.
   */
  render(): string {
    const lines: string[] = [];

    // Gauges
    this.gauges.set("mcp_gateway_uptime_seconds", (Date.now() - this.startTime) / 1000);
    for (const [name, value] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    }

    // Counters
    for (const [name, entries] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const entry of entries) {
        const labelStr = formatLabels(entry.labels);
        lines.push(`${name}${labelStr} ${entry.value}`);
      }
    }

    // Histograms
    for (const [name, entries] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      for (const entry of entries) {
        const labelStr = formatLabels(entry.labels);
        for (const [bucket, count] of entry.buckets) {
          lines.push(`${name}_bucket${formatLabels({ ...entry.labels, le: String(bucket) })} ${count}`);
        }
        lines.push(`${name}_bucket${formatLabels({ ...entry.labels, le: "+Inf" })} ${entry.count}`);
        lines.push(`${name}_sum${labelStr} ${entry.sum}`);
        lines.push(`${name}_count${labelStr} ${entry.count}`);
      }
    }

    return lines.join("\n") + "\n";
  }
}

function labelsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}
