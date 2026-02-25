import { describe, it, expect } from "vitest";
import { Authenticator, generateApiKey } from "../auth.js";
import type { AuthConfig } from "../types.js";

describe("Authenticator", () => {
  const config: AuthConfig = {
    type: "api-key",
    keys: [
      { id: "k1", key: "gw_test123", name: "Test", consumerId: "c1", roles: ["reader"], enabled: true },
      { id: "k2", key: "gw_disabled", name: "Disabled", consumerId: "c2", roles: ["admin"], enabled: false },
      { id: "k3", key: "gw_expired", name: "Expired", consumerId: "c3", roles: ["reader"], enabled: true, expiresAt: "2020-01-01T00:00:00Z" },
    ],
  };

  it("authenticates valid key", () => {
    const auth = new Authenticator(config);
    const ctx = auth.authenticate("gw_test123");
    expect(ctx).not.toBeNull();
    expect(ctx!.consumerId).toBe("c1");
    expect(ctx!.roles).toEqual(["reader"]);
  });

  it("rejects unknown key", () => {
    const auth = new Authenticator(config);
    expect(auth.authenticate("gw_unknown")).toBeNull();
  });

  it("rejects disabled key", () => {
    const auth = new Authenticator(config);
    expect(auth.authenticate("gw_disabled")).toBeNull();
  });

  it("rejects expired key", () => {
    const auth = new Authenticator(config);
    expect(auth.authenticate("gw_expired")).toBeNull();
  });

  it("allows anonymous when auth is none", () => {
    const auth = new Authenticator({ type: "none" });
    const ctx = auth.authenticate(undefined);
    expect(ctx).not.toBeNull();
    expect(ctx!.consumerId).toBe("anonymous");
  });

  it("generates valid API keys", () => {
    const key = generateApiKey();
    expect(key.startsWith("gw_")).toBe(true);
    expect(key.length).toBeGreaterThan(20);
  });
});
