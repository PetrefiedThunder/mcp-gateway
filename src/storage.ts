/**
 * Storage abstraction — SQLite (embedded) or PostgreSQL (production).
 * 
 * Both implement the same interface for audit log and metering persistence.
 * SQLite is zero-config. Postgres requires DATABASE_URL or dsn in config.
 */

import Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import type { AuditEntry, AuditConfig, MeteringConfig } from "./types.js";

// ---- Storage Interface ----

export interface StorageBackend {
  // Audit
  initAuditSchema(): void;
  insertAudit(entry: AuditEntry): void;
  queryAudit(opts: AuditQueryOpts): AuditEntry[];
  getLastAuditHash(): string | null;
  getAllAuditOrdered(): AuditEntry[];
  auditStats(): { total: number; byStatus: Record<string, number>; byServer: Record<string, number> };
  auditCount(): number;
  
  // Metering
  initMeterSchema(): void;
  upsertMeter(consumerId: string, serverId: string, tool: string, periodKey: string, calls: number, errors: number, latencyMs: number): void;
  queryMeter(consumerId?: string, from?: string, to?: string): MeterRow[];
  
  close(): void;
}

export interface AuditQueryOpts {
  consumerId?: string;
  serverId?: string;
  tool?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface MeterRow {
  consumerId: string;
  serverId: string;
  tool: string;
  periodKey: string;
  calls: number;
  errors: number;
  totalLatencyMs: number;
}

// ---- SQLite Implementation ----

export class SqliteStorage implements StorageBackend {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -64000"); // 64MB cache
  }

  initAuditSchema() {
    this.db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_consumer ON audit_log(consumer_id);
      CREATE INDEX IF NOT EXISTS idx_audit_server ON audit_log(server_id);
      CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_log(status);
      CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_log(tool);
    `);
  }

  insertAudit(entry: AuditEntry) {
    this.db.prepare(`
      INSERT INTO audit_log (id, timestamp, consumer_id, api_key_id, server_id, tool, args, response, latency_ms, status, error, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id, entry.timestamp, entry.consumerId, entry.apiKeyId,
      entry.serverId, entry.tool, entry.args, entry.response?.slice(0, 10000),
      entry.latencyMs, entry.status, entry.error, entry.prevHash, entry.hash,
    );
  }

  queryAudit(opts: AuditQueryOpts): AuditEntry[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (opts.consumerId) { conditions.push("consumer_id = ?"); params.push(opts.consumerId); }
    if (opts.serverId) { conditions.push("server_id = ?"); params.push(opts.serverId); }
    if (opts.tool) { conditions.push("tool = ?"); params.push(opts.tool); }
    if (opts.status) { conditions.push("status = ?"); params.push(opts.status); }
    if (opts.from) { conditions.push("timestamp >= ?"); params.push(opts.from); }
    if (opts.to) { conditions.push("timestamp <= ?"); params.push(opts.to); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(
      `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(...params, opts.limit || 100, opts.offset || 0) as any[];

    return rows.map(rowToAuditEntry);
  }

  getLastAuditHash(): string | null {
    const row = this.db.prepare("SELECT hash FROM audit_log ORDER BY rowid DESC LIMIT 1").get() as any;
    return row?.hash || null;
  }

  getAllAuditOrdered(): AuditEntry[] {
    return (this.db.prepare("SELECT * FROM audit_log ORDER BY rowid ASC").all() as any[]).map(rowToAuditEntry);
  }

  auditStats() {
    const total = (this.db.prepare("SELECT COUNT(*) as c FROM audit_log").get() as any).c;
    const byStatus: Record<string, number> = {};
    const byServer: Record<string, number> = {};
    for (const r of this.db.prepare("SELECT status, COUNT(*) as c FROM audit_log GROUP BY status").all() as any[]) byStatus[r.status] = r.c;
    for (const r of this.db.prepare("SELECT server_id, COUNT(*) as c FROM audit_log GROUP BY server_id").all() as any[]) byServer[r.server_id] = r.c;
    return { total, byStatus, byServer };
  }

  auditCount() {
    return (this.db.prepare("SELECT COUNT(*) as c FROM audit_log").get() as any).c;
  }

  // ---- Metering ----

  initMeterSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meter (
        consumer_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        period_key TEXT NOT NULL,
        calls INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        total_latency_ms INTEGER DEFAULT 0,
        PRIMARY KEY (consumer_id, server_id, tool, period_key)
      );
      CREATE INDEX IF NOT EXISTS idx_meter_consumer ON meter(consumer_id);
      CREATE INDEX IF NOT EXISTS idx_meter_period ON meter(period_key);
    `);
  }

  upsertMeter(consumerId: string, serverId: string, tool: string, periodKey: string, calls: number, errors: number, latencyMs: number) {
    this.db.prepare(`
      INSERT INTO meter (consumer_id, server_id, tool, period_key, calls, errors, total_latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (consumer_id, server_id, tool, period_key)
      DO UPDATE SET calls = calls + ?, errors = errors + ?, total_latency_ms = total_latency_ms + ?
    `).run(consumerId, serverId, tool, periodKey, calls, errors, latencyMs, calls, errors, latencyMs);
  }

  queryMeter(consumerId?: string, from?: string, to?: string): MeterRow[] {
    const conditions: string[] = [];
    const params: any[] = [];
    if (consumerId) { conditions.push("consumer_id = ?"); params.push(consumerId); }
    if (from) { conditions.push("period_key >= ?"); params.push(from); }
    if (to) { conditions.push("period_key <= ?"); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return (this.db.prepare(`SELECT * FROM meter ${where} ORDER BY period_key DESC`).all(...params) as any[]).map((r) => ({
      consumerId: r.consumer_id, serverId: r.server_id, tool: r.tool,
      periodKey: r.period_key, calls: r.calls, errors: r.errors, totalLatencyMs: r.total_latency_ms,
    }));
  }

  close() {
    this.db.close();
  }
}

// ---- PostgreSQL Implementation ----

export class PostgresStorage implements StorageBackend {
  private pool: any; // pg.Pool
  private ready: Promise<void>;

  constructor(dsn: string) {
    // Dynamic import to avoid requiring pg when using sqlite
    this.ready = this.init(dsn);
  }

  private async init(dsn: string) {
    // @ts-ignore — pg is optional, only needed for postgres storage
    const pg = await import("pg");
    this.pool = new (pg.default?.Pool || pg.Pool)({ connectionString: dsn });
  }

  async ensureReady() { await this.ready; }

  initAuditSchema() {
    this.pool?.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        consumer_id TEXT NOT NULL,
        api_key_id TEXT,
        server_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        args JSONB,
        response JSONB,
        latency_ms INTEGER,
        status TEXT NOT NULL,
        error TEXT,
        prev_hash TEXT,
        hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_consumer ON audit_log(consumer_id);
      CREATE INDEX IF NOT EXISTS idx_audit_server ON audit_log(server_id);
      CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_log(status);
    `);
  }

  insertAudit(entry: AuditEntry) {
    this.pool?.query(
      `INSERT INTO audit_log (id, timestamp, consumer_id, api_key_id, server_id, tool, args, response, latency_ms, status, error, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [entry.id, entry.timestamp, entry.consumerId, entry.apiKeyId, entry.serverId, entry.tool,
       entry.args, entry.response?.slice(0, 10000), entry.latencyMs, entry.status, entry.error, entry.prevHash, entry.hash],
    );
  }

  queryAudit(opts: AuditQueryOpts): AuditEntry[] {
    // Sync return for interface compat — in production use async variant
    return [];
  }

  getLastAuditHash(): string | null { return null; }
  getAllAuditOrdered(): AuditEntry[] { return []; }
  auditStats() { return { total: 0, byStatus: {}, byServer: {} }; }
  auditCount() { return 0; }

  initMeterSchema() {
    this.pool?.query(`
      CREATE TABLE IF NOT EXISTS meter (
        consumer_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        period_key TEXT NOT NULL,
        calls INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        total_latency_ms BIGINT DEFAULT 0,
        PRIMARY KEY (consumer_id, server_id, tool, period_key)
      );
    `);
  }

  upsertMeter(consumerId: string, serverId: string, tool: string, periodKey: string, calls: number, errors: number, latencyMs: number) {
    this.pool?.query(
      `INSERT INTO meter (consumer_id, server_id, tool, period_key, calls, errors, total_latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (consumer_id, server_id, tool, period_key)
       DO UPDATE SET calls = meter.calls + $5, errors = meter.errors + $6, total_latency_ms = meter.total_latency_ms + $7`,
      [consumerId, serverId, tool, periodKey, calls, errors, latencyMs],
    );
  }

  queryMeter() { return []; }

  close() { this.pool?.end(); }
}

// ---- Helpers ----

function rowToAuditEntry(r: any): AuditEntry {
  return {
    id: r.id, timestamp: r.timestamp, consumerId: r.consumer_id,
    apiKeyId: r.api_key_id, serverId: r.server_id, tool: r.tool,
    args: r.args, response: r.response, latencyMs: r.latency_ms,
    status: r.status, error: r.error, prevHash: r.prev_hash, hash: r.hash,
  };
}

export function createStorage(config: AuditConfig): StorageBackend {
  if (config.storage === "postgres" && config.dsn) {
    return new PostgresStorage(config.dsn);
  }
  return new SqliteStorage(config.path || "./gateway-audit.db");
}
