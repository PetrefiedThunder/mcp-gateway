import { describe, it, expect } from "vitest";
import { validateConfig } from "../config.js";
import type { GatewayConfig } from "../types.js";

describe("validateConfig", () => {
  const valid: GatewayConfig = {
    auth: { type: "api-key", keys: [{ id: "k1", key: "gw_x", name: "T", consumerId: "c1", roles: ["r"], enabled: true }] },
    servers: [{ id: "s1", name: "S1", command: "node", args: ["x.js"], enabled: true }],
    policies: [{ id: "p1", name: "P", roles: ["r"], rules: [{ action: "allow" }] }],
    audit: { enabled: true, storage: "sqlite", path: "./a.db", hashChain: true },
    metering: { enabled: true, dimensions: ["calls"] },
  };

  it("passes valid config", () => {
    expect(validateConfig(valid)).toEqual([]);
  });

  it("catches duplicate server IDs", () => {
    const bad = { ...valid, servers: [valid.servers[0], { ...valid.servers[0] }] };
    const errors = validateConfig(bad);
    expect(errors.some((e) => e.includes("duplicate server"))).toBe(true);
  });

  it("catches duplicate policy IDs", () => {
    const bad = { ...valid, policies: [valid.policies[0], { ...valid.policies[0] }] };
    const errors = validateConfig(bad);
    expect(errors.some((e) => e.includes("duplicate policy"))).toBe(true);
  });

  it("catches missing server command", () => {
    const bad = { ...valid, servers: [{ id: "s1", name: "S1", command: "", args: [], enabled: true }] };
    const errors = validateConfig(bad);
    expect(errors.some((e) => e.includes("missing command"))).toBe(true);
  });

  it("catches missing API key fields", () => {
    const bad = { ...valid, auth: { type: "api-key" as const, keys: [{ id: "k1", key: "", name: "T", consumerId: "", roles: [], enabled: true }] } };
    const errors = validateConfig(bad);
    expect(errors.length).toBeGreaterThan(0);
  });
});
