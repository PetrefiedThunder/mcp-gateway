/**
 * IP allowlist/denylist middleware.
 * Supports exact IPs, CIDR ranges, and wildcard patterns.
 */

export interface IpFilterConfig {
  enabled: boolean;
  mode: "allowlist" | "denylist";
  ips: string[];
}

export class IpFilter {
  private matchers: ((ip: string) => boolean)[] = [];

  constructor(private config: IpFilterConfig) {
    if (config.enabled) {
      this.matchers = config.ips.map(compileIpPattern);
    }
  }

  /**
   * Returns true if the IP is allowed through.
   */
  check(ip: string): boolean {
    if (!this.config.enabled) return true;

    const matches = this.matchers.some((m) => m(ip));

    if (this.config.mode === "allowlist") return matches;
    if (this.config.mode === "denylist") return !matches;

    return true;
  }
}

function compileIpPattern(pattern: string): (ip: string) => boolean {
  // CIDR notation
  if (pattern.includes("/")) {
    const [base, bits] = pattern.split("/");
    const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
    const baseNum = ipToNum(base);
    return (ip) => (ipToNum(ip) & mask) === (baseNum & mask);
  }

  // Wildcard
  if (pattern.includes("*")) {
    const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, "\\d{1,3}") + "$");
    return (ip) => regex.test(ip);
  }

  // Exact match
  return (ip) => ip === pattern;
}

function ipToNum(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
