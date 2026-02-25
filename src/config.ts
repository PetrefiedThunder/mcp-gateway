/**
 * Config loader with hot-reload support.
 * Watches gateway.yaml and triggers callback on changes.
 */

import { readFileSync, existsSync, watchFile, unwatchFile } from "fs";
import { parse as parseYaml } from "yaml";
import type { GatewayConfig } from "./types.js";

const DEFAULT_CONFIG: GatewayConfig = {
  auth: { type: "none" },
  servers: [],
  policies: [{ id: "default", name: "Allow all", roles: ["*"], rules: [{ action: "allow" }] }],
  audit: { enabled: true, storage: "sqlite", path: "./gateway-audit.db", hashChain: true },
  metering: { enabled: true, dimensions: ["calls", "latency", "errors"] },
  rateLimit: { enabled: true, defaultPerMinute: 60 },
};

export function loadConfig(customPath?: string): { config: GatewayConfig; path: string | null } {
  const paths = [
    customPath,
    process.env.MCP_GATEWAY_CONFIG,
    "./gateway.yaml",
    "./gateway.yml",
    "./gateway.json",
  ].filter(Boolean) as string[];

  for (const p of paths) {
    if (existsSync(p)) {
      const raw = readFileSync(p, "utf-8");
      const config = p.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
      return { config: { ...DEFAULT_CONFIG, ...config }, path: p };
    }
  }

  return { config: DEFAULT_CONFIG, path: null };
}

export function watchConfig(
  configPath: string,
  onChange: (config: GatewayConfig) => void,
  intervalMs = 2000,
) {
  let lastMtime = 0;

  watchFile(configPath, { interval: intervalMs }, (curr) => {
    if (curr.mtimeMs > lastMtime) {
      lastMtime = curr.mtimeMs;
      try {
        const raw = readFileSync(configPath, "utf-8");
        const config = configPath.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
        console.log(`[config] Reloaded ${configPath}`);
        onChange({ ...DEFAULT_CONFIG, ...config });
      } catch (err: any) {
        console.error(`[config] Reload failed: ${err.message}`);
      }
    }
  });

  return () => unwatchFile(configPath);
}

/**
 * Validate a gateway config. Returns list of errors.
 */
export function validateConfig(config: GatewayConfig): string[] {
  const errors: string[] = [];

  if (!config.auth) errors.push("auth is required");
  if (!config.policies || !config.policies.length) errors.push("at least one policy is required");
  if (!config.audit) errors.push("audit config is required");

  // Check for duplicate server IDs
  const serverIds = new Set<string>();
  for (const s of config.servers || []) {
    if (!s.id) errors.push("server missing id");
    if (!s.command) errors.push(`server ${s.id}: missing command`);
    if (serverIds.has(s.id)) errors.push(`duplicate server id: ${s.id}`);
    serverIds.add(s.id);
  }

  // Check for duplicate policy IDs
  const policyIds = new Set<string>();
  for (const p of config.policies || []) {
    if (!p.id) errors.push("policy missing id");
    if (!p.roles?.length) errors.push(`policy ${p.id}: no roles`);
    if (!p.rules?.length) errors.push(`policy ${p.id}: no rules`);
    if (policyIds.has(p.id)) errors.push(`duplicate policy id: ${p.id}`);
    policyIds.add(p.id);
  }

  // Check API keys
  if (config.auth.type === "api-key") {
    const keyIds = new Set<string>();
    for (const k of config.auth.keys || []) {
      if (!k.id) errors.push("API key missing id");
      if (!k.key) errors.push(`API key ${k.id}: missing key`);
      if (!k.consumerId) errors.push(`API key ${k.id}: missing consumerId`);
      if (keyIds.has(k.id)) errors.push(`duplicate API key id: ${k.id}`);
      keyIds.add(k.id);
    }
  }

  return errors;
}
