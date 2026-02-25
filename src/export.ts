/**
 * Audit log export — batch export to file (JSONL/CSV), webhook, or S3.
 * 
 * Runs on a configurable interval, exporting new entries since last export.
 */

import { appendFileSync, existsSync, writeFileSync } from "fs";
import type { AuditExportConfig, AuditEntry } from "./types.js";

export class AuditExporter {
  private lastExportedId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private config: AuditExportConfig,
    private queryFn: (opts: any) => AuditEntry[],
  ) {}

  start() {
    const interval = this.config.intervalMs || 300000; // 5 min default
    this.timer = setInterval(() => this.exportBatch(), interval);
    console.log(`[export] Started ${this.config.type} export every ${interval / 1000}s → ${this.config.destination}`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async exportBatch() {
    const entries = this.queryFn({
      limit: this.config.batchSize || 500,
    });

    if (entries.length === 0) return;

    // Filter to only new entries
    const newEntries = this.lastExportedId
      ? entries.filter((e) => e.id > this.lastExportedId!)
      : entries;

    if (newEntries.length === 0) return;

    try {
      switch (this.config.type) {
        case "file":
          this.exportToFile(newEntries);
          break;
        case "webhook":
          await this.exportToWebhook(newEntries);
          break;
        case "s3":
          await this.exportToS3(newEntries);
          break;
      }

      this.lastExportedId = newEntries[0].id; // entries are DESC ordered
      console.log(`[export] Exported ${newEntries.length} entries to ${this.config.type}:${this.config.destination}`);
    } catch (err: any) {
      console.error(`[export] Failed: ${err.message}`);
    }
  }

  private exportToFile(entries: AuditEntry[]) {
    const dest = this.config.destination;

    if (this.config.format === "jsonl") {
      const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
      appendFileSync(dest, lines);
    } else if (this.config.format === "csv") {
      const header = "id,timestamp,consumerId,serverId,tool,status,latencyMs,error\n";
      if (!existsSync(dest)) writeFileSync(dest, header);
      const rows = entries.map((e) =>
        `${e.id},${e.timestamp},${e.consumerId},${e.serverId},${e.tool},${e.status},${e.latencyMs},${(e.error || "").replace(/,/g, ";")}`
      ).join("\n") + "\n";
      appendFileSync(dest, rows);
    }
  }

  private async exportToWebhook(entries: AuditEntry[]) {
    await fetch(this.config.destination, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, exportedAt: new Date().toISOString() }),
    });
  }

  private async exportToS3(entries: AuditEntry[]) {
    // S3 export using pre-signed URL or AWS SDK
    // For MVP, write to local file with S3-style naming
    const date = new Date().toISOString().split("T")[0];
    const hour = new Date().getUTCHours().toString().padStart(2, "0");
    const path = `${this.config.destination}/audit-${date}-${hour}.jsonl`;

    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    appendFileSync(path, lines);
  }
}
