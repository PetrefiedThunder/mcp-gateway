import { describe, it, expect } from "vitest";
import { RequestTracker, Logger } from "../middleware.js";

describe("RequestTracker", () => {
  it("tracks active requests", () => {
    const tracker = new RequestTracker();
    const ctx1 = tracker.start(5000);
    const ctx2 = tracker.start(5000);
    expect(tracker.activeCount).toBe(2);
    tracker.complete(ctx1.requestId);
    expect(tracker.activeCount).toBe(1);
    tracker.complete(ctx2.requestId);
    expect(tracker.activeCount).toBe(0);
  });

  it("enforces timeout", async () => {
    const tracker = new RequestTracker();
    const ctx = tracker.start(50); // 50ms timeout
    expect(ctx.abortController.signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(ctx.abortController.signal.aborted).toBe(true);
    expect(tracker.activeCount).toBe(0);
  });

  it("drains active requests", async () => {
    const tracker = new RequestTracker();
    tracker.start(60000);
    tracker.start(60000);
    expect(tracker.activeCount).toBe(2);
    await tracker.drain(200);
    expect(tracker.activeCount).toBe(0);
    expect(tracker.isDraining).toBe(true);
  });
});

describe("Logger", () => {
  it("creates structured log entries", () => {
    const logger = new Logger("debug");
    // Just verify it doesn't throw
    logger.debug("test", { key: "value" });
    logger.info("test");
    logger.warn("test");
    logger.error("test");
  });
});
