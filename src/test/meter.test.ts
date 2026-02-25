import { describe, it, expect } from "vitest";
import { Meter } from "../meter.js";

describe("Meter", () => {
  it("records and summarizes usage", () => {
    const meter = new Meter({ enabled: true, dimensions: ["calls", "latency", "errors"], flushIntervalMs: 999999 });
    meter.record("c1", "s1", "tool_a", 100, false);
    meter.record("c1", "s1", "tool_a", 200, false);
    meter.record("c1", "s1", "tool_b", 50, true);
    meter.record("c2", "s1", "tool_a", 75, false);

    const summary = meter.getSummary("c1");
    expect(summary.totalCalls).toBe(3);
    expect(summary.totalErrors).toBe(1);
    expect(summary.byTool.tool_a).toBe(2);
    expect(summary.byTool.tool_b).toBe(1);
    meter.stop();
  });

  it("isolates consumers", () => {
    const meter = new Meter({ enabled: true, dimensions: ["calls"], flushIntervalMs: 999999 });
    meter.record("c1", "s1", "t1", 10, false);
    meter.record("c2", "s1", "t1", 10, false);

    expect(meter.getSummary("c1").totalCalls).toBe(1);
    expect(meter.getSummary("c2").totalCalls).toBe(1);
    meter.stop();
  });

  it("tracks by server", () => {
    const meter = new Meter({ enabled: true, dimensions: ["calls"], flushIntervalMs: 999999 });
    meter.record("c1", "server-a", "t1", 10, false);
    meter.record("c1", "server-a", "t2", 10, false);
    meter.record("c1", "server-b", "t1", 10, false);

    const summary = meter.getSummary("c1");
    expect(summary.byServer["server-a"]).toBe(2);
    expect(summary.byServer["server-b"]).toBe(1);
    meter.stop();
  });

  it("does nothing when disabled", () => {
    const meter = new Meter({ enabled: false, dimensions: [] });
    meter.record("c1", "s1", "t1", 10, false);
    expect(meter.getSummary().totalCalls).toBe(0);
    meter.stop();
  });
});
