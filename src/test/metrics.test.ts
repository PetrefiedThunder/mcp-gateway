import { describe, it, expect } from "vitest";
import { Metrics } from "../metrics.js";

describe("Metrics", () => {
  it("renders prometheus format", () => {
    const m = new Metrics();
    m.recordCall("mcp-fred", "get_series", "success", 50);
    m.recordCall("mcp-fred", "get_series", "success", 100);
    m.recordCall("mcp-fred", "get_series", "error", 200);
    m.recordAuthFailure();
    m.recordRateLimit();
    m.setActiveServers(3);

    const output = m.render();
    expect(output).toContain("mcp_gateway_requests_total");
    expect(output).toContain("mcp_gateway_request_duration_ms");
    expect(output).toContain("mcp_gateway_active_servers 3");
    expect(output).toContain("mcp_gateway_uptime_seconds");
    expect(output).toContain("mcp_gateway_auth_failures_total");
    expect(output).toContain("mcp_gateway_rate_limited_total");
  });

  it("tracks counters with labels", () => {
    const m = new Metrics();
    m.increment("test_counter", { server: "a" });
    m.increment("test_counter", { server: "a" });
    m.increment("test_counter", { server: "b" });

    const output = m.render();
    expect(output).toContain('test_counter{server="a"} 2');
    expect(output).toContain('test_counter{server="b"} 1');
  });

  it("renders histogram buckets", () => {
    const m = new Metrics();
    m.observe("test_hist", { op: "read" }, 15);
    m.observe("test_hist", { op: "read" }, 150);

    const output = m.render();
    expect(output).toContain("test_hist_bucket");
    expect(output).toContain("test_hist_sum");
    expect(output).toContain("test_hist_count");
  });
});
