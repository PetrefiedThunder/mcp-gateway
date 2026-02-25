import { describe, it, expect, afterEach } from "vitest";
import { SqliteStorage } from "../storage.js";
import { existsSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";

const TEST_DB = "./test-storage.db";

function cleanup() {
  for (const f of [TEST_DB, TEST_DB + "-wal", TEST_DB + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe("SqliteStorage", () => {
  afterEach(() => cleanup());

  it("inserts and queries audit entries", () => {
    const store = new SqliteStorage(TEST_DB);
    store.initAuditSchema();

    store.insertAudit({
      id: randomUUID(), timestamp: new Date().toISOString(),
      consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "test",
      args: "{}", response: "{}", latencyMs: 50, status: "success", hash: "abc",
    });

    const results = store.queryAudit({});
    expect(results.length).toBe(1);
    expect(results[0].consumerId).toBe("c1");
    store.close();
  });

  it("filters audit by status", () => {
    const store = new SqliteStorage(TEST_DB);
    store.initAuditSchema();

    store.insertAudit({ id: randomUUID(), timestamp: new Date().toISOString(), consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "t1", args: "{}", response: "{}", latencyMs: 10, status: "success", hash: "a" });
    store.insertAudit({ id: randomUUID(), timestamp: new Date().toISOString(), consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "t2", args: "{}", response: "{}", latencyMs: 10, status: "error", hash: "b" });

    const errors = store.queryAudit({ status: "error" });
    expect(errors.length).toBe(1);
    expect(errors[0].tool).toBe("t2");
    store.close();
  });

  it("upserts meter entries", () => {
    const store = new SqliteStorage(TEST_DB);
    store.initMeterSchema();

    store.upsertMeter("c1", "s1", "t1", "2026-02-24T20", 1, 0, 100);
    store.upsertMeter("c1", "s1", "t1", "2026-02-24T20", 1, 1, 200);

    const rows = store.queryMeter("c1");
    expect(rows.length).toBe(1);
    expect(rows[0].calls).toBe(2);
    expect(rows[0].errors).toBe(1);
    expect(rows[0].totalLatencyMs).toBe(300);
    store.close();
  });

  it("computes audit stats", () => {
    const store = new SqliteStorage(TEST_DB);
    store.initAuditSchema();

    store.insertAudit({ id: randomUUID(), timestamp: new Date().toISOString(), consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "t1", args: "{}", response: "{}", latencyMs: 10, status: "success", hash: "a" });
    store.insertAudit({ id: randomUUID(), timestamp: new Date().toISOString(), consumerId: "c1", apiKeyId: "k1", serverId: "s2", tool: "t2", args: "{}", response: "{}", latencyMs: 10, status: "denied", hash: "b" });

    const stats = store.auditStats();
    expect(stats.total).toBe(2);
    expect(stats.byStatus.success).toBe(1);
    expect(stats.byServer.s1).toBe(1);
    store.close();
  });
});
