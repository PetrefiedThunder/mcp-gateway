import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../policy.js";
import type { PolicyConfig, ConsumerContext } from "../types.js";

const policies: PolicyConfig[] = [
  {
    id: "reader", name: "Reader", roles: ["reader"],
    rules: [
      { tool: "get_*", action: "allow" },
      { tool: "search_*", action: "allow" },
      { tool: "delete_*", action: "deny" },
      { tool: "*", action: "deny" },
    ],
  },
  {
    id: "admin", name: "Admin", roles: ["admin"],
    rules: [{ action: "allow" }],
  },
  {
    id: "restricted", name: "Restricted server", roles: ["reader"],
    rules: [
      { server: "mcp-stripe", tool: "*", action: "deny" },
    ],
  },
];

const readerCtx: ConsumerContext = { consumerId: "user1", apiKeyId: "k1", roles: ["reader"] };
const adminCtx: ConsumerContext = { consumerId: "admin1", apiKeyId: "k2", roles: ["admin"] };
const noRoleCtx: ConsumerContext = { consumerId: "nobody", apiKeyId: "k3", roles: [] };

describe("PolicyEngine", () => {
  const engine = new PolicyEngine(policies);

  it("allows reader to call get_* tools", () => {
    const d = engine.evaluate(readerCtx, "mcp-fred", "get_series");
    expect(d.allowed).toBe(true);
  });

  it("allows reader to call search_* tools", () => {
    const d = engine.evaluate(readerCtx, "mcp-pubmed", "search_articles");
    expect(d.allowed).toBe(true);
  });

  it("denies reader from calling delete_* tools", () => {
    const d = engine.evaluate(readerCtx, "mcp-fred", "delete_record");
    expect(d.allowed).toBe(false);
  });

  it("denies reader from accessing stripe (non-get tool)", () => {
    const d = engine.evaluate(readerCtx, "mcp-stripe", "create_customer");
    expect(d.allowed).toBe(false);
  });

  it("allows admin to call anything", () => {
    const d = engine.evaluate(adminCtx, "mcp-stripe", "delete_customer");
    expect(d.allowed).toBe(true);
  });

  it("denies unknown roles (default deny)", () => {
    const d = engine.evaluate(noRoleCtx, "mcp-fred", "get_series");
    expect(d.allowed).toBe(false);
  });
});
