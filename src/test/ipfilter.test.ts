import { describe, it, expect } from "vitest";
import { IpFilter } from "../ipfilter.js";

describe("IpFilter", () => {
  it("allows all when disabled", () => {
    const f = new IpFilter({ enabled: false, mode: "allowlist", ips: [] });
    expect(f.check("1.2.3.4")).toBe(true);
  });

  it("allowlist: allows matching IPs", () => {
    const f = new IpFilter({ enabled: true, mode: "allowlist", ips: ["10.0.0.1", "192.168.1.1"] });
    expect(f.check("10.0.0.1")).toBe(true);
    expect(f.check("192.168.1.1")).toBe(true);
    expect(f.check("8.8.8.8")).toBe(false);
  });

  it("denylist: blocks matching IPs", () => {
    const f = new IpFilter({ enabled: true, mode: "denylist", ips: ["10.0.0.1"] });
    expect(f.check("10.0.0.1")).toBe(false);
    expect(f.check("10.0.0.2")).toBe(true);
  });

  it("supports CIDR ranges", () => {
    const f = new IpFilter({ enabled: true, mode: "allowlist", ips: ["10.0.0.0/24"] });
    expect(f.check("10.0.0.1")).toBe(true);
    expect(f.check("10.0.0.254")).toBe(true);
    expect(f.check("10.0.1.1")).toBe(false);
  });

  it("supports wildcard patterns", () => {
    const f = new IpFilter({ enabled: true, mode: "allowlist", ips: ["192.168.*.*"] });
    expect(f.check("192.168.0.1")).toBe(true);
    expect(f.check("192.168.255.255")).toBe(true);
    expect(f.check("10.0.0.1")).toBe(false);
  });
});
