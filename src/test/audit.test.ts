import { describe, it, expect, afterEach } from "vitest";
import { AuditLog } from "../audit.js";
import { unlinkSync, existsSync } from "fs";

const TEST_DB = "./test-audit.db";

function cleanup() {
  for (const f of [TEST_DB, TEST_DB + "-wal", TEST_DB + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe("AuditLog", () => {
  afterEach(() => cleanup());

  it("logs and queries entries", async () => {
    const audit = new AuditLog({ enabled: true, storage: "sqlite", path: TEST_DB, hashChain: true });
    await audit.log({ consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "test_tool", args: "{}", response: "{}", latencyMs: 50, status: "success" });
    await audit.log({ consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "other_tool", args: "{}", response: "{}", latencyMs: 100, status: "error", error: "fail" });

    const all = audit.query({});
    expect(all.length).toBe(2);

    const errors = audit.query({ status: "error" });
    expect(errors.length).toBe(1);
    expect(errors[0].tool).toBe("other_tool");
    audit.close();
  });

  it("verifies hash chain integrity", async () => {
    const audit = new AuditLog({ enabled: true, storage: "sqlite", path: TEST_DB, hashChain: true });
    await audit.log({ consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "t1", args: "{}", response: "{}", latencyMs: 10, status: "success" });
    await audit.log({ consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "t2", args: "{}", response: "{}", latencyMs: 20, status: "success" });

    const result = audit.verify();
    expect(result.valid).toBe(true);
    audit.close();
  });

  it("reports stats correctly", async () => {
    const audit = new AuditLog({ enabled: true, storage: "sqlite", path: TEST_DB, hashChain: false });
    await audit.log({ consumerId: "c1", apiKeyId: "k1", serverId: "s1", tool: "t1", args: "{}", response: "{}", latencyMs: 10, status: "success" });
    await audit.log({ consumerId: "c1", apiKeyId: "k1", serverId: "s2", tool: "t2", args: "{}", response: "{}", latencyMs: 20, status: "denied" });

    const stats = audit.stats();
    expect(stats.total).toBe(2);
    expect(stats.byStatus.success).toBe(1);
    expect(stats.byStatus.denied).toBe(1);
    expect(stats.byServer.s1).toBe(1);
    audit.close();
  });
});
