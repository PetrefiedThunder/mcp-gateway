import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import type { AuditConfig, AuditEntry } from "./types.js";

export class AuditLog {
  private db: Database.Database | null = null;
  private lastHash: string = "genesis";
  private webhookUrl?: string;
  private hashChain: boolean;

  constructor(private config: AuditConfig) {
    this.hashChain = config.hashChain ?? true;

    if (config.storage === "sqlite") {
      const path = config.path || "./gateway-audit.db";
      this.db = new Database(path);
      this.db.pragma("journal_mode = WAL");
      this.initSchema();
      this.loadLastHash();
    }

    if (config.webhookUrl) {
      this.webhookUrl = config.webhookUrl;
    }
  }

  private initSchema() {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        consumer_id TEXT NOT NULL,
        api_key_id TEXT,
        server_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        args TEXT,
        response TEXT,
        latency_ms INTEGER,
        status TEXT NOT NULL,
        error TEXT,
        prev_hash TEXT,
        hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_consumer ON audit_log(consumer_id);
      CREATE INDEX IF NOT EXISTS idx_audit_server ON audit_log(server_id);
      CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_log(tool);
      CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_log(status);
    `);
  }

  private loadLastHash() {
    const row = this.db!.prepare("SELECT hash FROM audit_log ORDER BY rowid DESC LIMIT 1").get() as any;
    if (row) this.lastHash = row.hash;
  }

  private computeHash(entry: Omit<AuditEntry, "hash">): string {
    const data = `${entry.id}|${entry.timestamp}|${entry.consumerId}|${entry.serverId}|${entry.tool}|${entry.status}|${entry.prevHash || ""}`;
    return createHash("sha256").update(data).digest("hex");
  }

  async log(partial: Omit<AuditEntry, "id" | "hash" | "prevHash" | "timestamp">): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...partial,
    };

    if (this.hashChain) {
      entry.prevHash = this.lastHash;
      entry.hash = this.computeHash(entry);
      this.lastHash = entry.hash;
    } else {
      entry.hash = this.computeHash(entry);
    }

    // SQLite storage
    if (this.db) {
      this.db.prepare(`
        INSERT INTO audit_log (id, timestamp, consumer_id, api_key_id, server_id, tool, args, response, latency_ms, status, error, prev_hash, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id, entry.timestamp, entry.consumerId, entry.apiKeyId,
        entry.serverId, entry.tool, entry.args, entry.response?.slice(0, 10000),
        entry.latencyMs, entry.status, entry.error, entry.prevHash, entry.hash
      );
    }

    // Webhook delivery
    if (this.webhookUrl) {
      fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch(() => {}); // fire and forget
    }

    return entry;
  }

  query(opts: {
    consumerId?: string;
    serverId?: string;
    tool?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): AuditEntry[] {
    if (!this.db) return [];

    const conditions: string[] = [];
    const params: any[] = [];

    if (opts.consumerId) { conditions.push("consumer_id = ?"); params.push(opts.consumerId); }
    if (opts.serverId) { conditions.push("server_id = ?"); params.push(opts.serverId); }
    if (opts.tool) { conditions.push("tool = ?"); params.push(opts.tool); }
    if (opts.status) { conditions.push("status = ?"); params.push(opts.status); }
    if (opts.from) { conditions.push("timestamp >= ?"); params.push(opts.from); }
    if (opts.to) { conditions.push("timestamp <= ?"); params.push(opts.to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit || 100;
    const offset = opts.offset || 0;

    const rows = this.db.prepare(
      `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as any[];

    return rows.map((r) => ({
      id: r.id, timestamp: r.timestamp, consumerId: r.consumer_id,
      apiKeyId: r.api_key_id, serverId: r.server_id, tool: r.tool,
      args: r.args, response: r.response, latencyMs: r.latency_ms,
      status: r.status, error: r.error, prevHash: r.prev_hash, hash: r.hash,
    }));
  }

  verify(): { valid: boolean; brokenAt?: string } {
    if (!this.db || !this.hashChain) return { valid: true };

    const rows = this.db.prepare("SELECT * FROM audit_log ORDER BY rowid ASC").all() as any[];
    let prevHash = "genesis";

    for (const row of rows) {
      const entry: AuditEntry = {
        id: row.id, timestamp: row.timestamp, consumerId: row.consumer_id,
        apiKeyId: row.api_key_id, serverId: row.server_id, tool: row.tool,
        args: row.args, response: row.response, latencyMs: row.latency_ms,
        status: row.status, error: row.error, prevHash: row.prev_hash, hash: row.hash,
      };

      if (entry.prevHash !== prevHash) return { valid: false, brokenAt: entry.id };
      const expected = this.computeHash(entry);
      if (entry.hash !== expected) return { valid: false, brokenAt: entry.id };
      prevHash = entry.hash;
    }

    return { valid: true };
  }

  stats(): { total: number; byStatus: Record<string, number>; byServer: Record<string, number> } {
    if (!this.db) return { total: 0, byStatus: {}, byServer: {} };

    const total = (this.db.prepare("SELECT COUNT(*) as c FROM audit_log").get() as any).c;
    const byStatus: Record<string, number> = {};
    const byServer: Record<string, number> = {};

    for (const row of this.db.prepare("SELECT status, COUNT(*) as c FROM audit_log GROUP BY status").all() as any[]) {
      byStatus[row.status] = row.c;
    }
    for (const row of this.db.prepare("SELECT server_id, COUNT(*) as c FROM audit_log GROUP BY server_id").all() as any[]) {
      byServer[row.server_id] = row.c;
    }

    return { total, byStatus, byServer };
  }

  close() {
    this.db?.close();
  }
}
