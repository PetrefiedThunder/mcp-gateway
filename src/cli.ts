#!/usr/bin/env node

/**
 * MCP Gateway CLI — manage keys, policies, audit, and servers.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { generateApiKey, hashKey } from "./auth.js";
import { AuditLog } from "./audit.js";

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

function loadConfig(path = "./gateway.yaml") {
  if (!existsSync(path)) {
    console.error(`Config not found: ${path}`);
    process.exit(1);
  }
  return parseYaml(readFileSync(path, "utf-8"));
}

function saveConfig(config: any, path = "./gateway.yaml") {
  writeFileSync(path, stringifyYaml(config, { indent: 2 }));
}

function printHelp() {
  console.log(`
MCP Gateway CLI

USAGE:
  mcp-gateway <command> [options]

COMMANDS:
  serve                    Start the gateway (MCP stdio server)
  init                     Generate example gateway.yaml

  keys list                List API keys
  keys create <name> <consumer> <roles>  Create a new API key
  keys revoke <id>         Disable an API key

  servers list             List registered servers
  servers add <id> <cmd>   Add a server
  servers remove <id>      Remove a server

  audit log [--limit N]    View audit log
  audit stats              View audit statistics
  audit verify             Verify hash chain integrity

  usage [consumer]         View usage metrics

  version                  Show version
`);
}

switch (command) {
  case "init": {
    if (existsSync("./gateway.yaml")) {
      console.log("gateway.yaml already exists");
    } else {
      const example = readFileSync(new URL("../gateway.example.yaml", import.meta.url), "utf-8");
      writeFileSync("./gateway.yaml", example);
      console.log("Created gateway.yaml from template");
    }
    break;
  }

  case "keys": {
    const config = loadConfig();
    if (subcommand === "list") {
      const keys = config.auth?.keys || [];
      console.log(`\n${"ID".padEnd(12)} ${"Name".padEnd(20)} ${"Consumer".padEnd(15)} ${"Roles".padEnd(20)} ${"Enabled"}`);
      console.log("-".repeat(80));
      for (const k of keys) {
        console.log(`${k.id.padEnd(12)} ${k.name.padEnd(20)} ${k.consumerId.padEnd(15)} ${k.roles.join(",").padEnd(20)} ${k.enabled}`);
      }
    } else if (subcommand === "create") {
      const name = args[2] || "New Key";
      const consumer = args[3] || "default";
      const roles = (args[4] || "reader").split(",");

      const rawKey = generateApiKey();
      const id = `key-${Date.now()}`;

      if (!config.auth) config.auth = { type: "api-key", keys: [] };
      if (!config.auth.keys) config.auth.keys = [];

      config.auth.keys.push({
        id, key: rawKey, name, consumerId: consumer,
        roles, enabled: true,
      });

      saveConfig(config);
      console.log(`\nAPI Key Created:`);
      console.log(`  ID:       ${id}`);
      console.log(`  Key:      ${rawKey}`);
      console.log(`  Consumer: ${consumer}`);
      console.log(`  Roles:    ${roles.join(", ")}`);
      console.log(`\n⚠️  Save the key now — it won't be shown again.`);
    } else if (subcommand === "revoke") {
      const id = args[2];
      const key = config.auth?.keys?.find((k: any) => k.id === id);
      if (key) { key.enabled = false; saveConfig(config); console.log(`Key ${id} revoked.`); }
      else console.log(`Key ${id} not found.`);
    }
    break;
  }

  case "servers": {
    const config = loadConfig();
    if (subcommand === "list") {
      const servers = config.servers || [];
      console.log(`\n${"ID".padEnd(20)} ${"Name".padEnd(30)} ${"Enabled".padEnd(10)} ${"Command"}`);
      console.log("-".repeat(90));
      for (const s of servers) {
        console.log(`${s.id.padEnd(20)} ${(s.name || "").padEnd(30)} ${String(s.enabled).padEnd(10)} ${s.command} ${(s.args || []).join(" ")}`);
      }
    }
    break;
  }

  case "audit": {
    const config = loadConfig();
    const audit = new AuditLog(config.audit || { enabled: true, storage: "sqlite", path: "./gateway-audit.db", hashChain: true });

    if (subcommand === "log") {
      const limit = parseInt(args[2]?.replace("--limit=", "").replace("--limit", "") || "20");
      const entries = audit.query({ limit });
      for (const e of entries) {
        const status = e.status === "success" ? "✅" : e.status === "denied" ? "🚫" : e.status === "rate-limited" ? "⏱️" : "❌";
        console.log(`${status} ${e.timestamp} | ${e.consumerId.padEnd(15)} | ${e.serverId.padEnd(15)} | ${e.tool.padEnd(20)} | ${e.latencyMs}ms`);
      }
    } else if (subcommand === "stats") {
      const stats = audit.stats();
      console.log(`\nTotal calls: ${stats.total}`);
      console.log(`\nBy status:`);
      for (const [k, v] of Object.entries(stats.byStatus)) console.log(`  ${k}: ${v}`);
      console.log(`\nBy server:`);
      for (const [k, v] of Object.entries(stats.byServer)) console.log(`  ${k}: ${v}`);
    } else if (subcommand === "verify") {
      const result = audit.verify();
      if (result.valid) console.log("✅ Audit chain integrity verified.");
      else console.log(`❌ Chain broken at entry: ${result.brokenAt}`);
    }

    audit.close();
    break;
  }

  case "version":
    console.log("mcp-gateway 1.0.0");
    break;

  default:
    printHelp();
}
