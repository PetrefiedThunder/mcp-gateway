"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch("/api/gateway/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Gateway Info</h3>
          <div className="space-y-3 text-sm">
            <Row label="Version" value={health?.version || "—"} />
            <Row label="Status" value={health?.status || "—"} />
            <Row label="Uptime" value={health ? `${Math.round(health.uptime)}s` : "—"} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Endpoints</h3>
          <div className="space-y-3 text-sm">
            <Row label="MCP" value="POST /mcp" />
            <Row label="Health" value="GET /api/health" />
            <Row label="Metrics" value="GET /metrics" />
            <Row label="OpenAPI" value="GET /openapi.json" />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 col-span-2">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Configuration</h3>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Edit <code className="text-[var(--accent)]">gateway.yaml</code> to configure the gateway.
            Hot-reload is supported — changes take effect without restart.
          </p>
          <pre className="bg-black rounded-lg p-4 text-xs text-green-400 overflow-x-auto">{`# Key management
mcp-gateway keys list
mcp-gateway keys create "Agent Name" consumer-id reader,writer
mcp-gateway keys revoke key-id

# Audit
mcp-gateway audit log --limit=50
mcp-gateway audit stats
mcp-gateway audit verify

# Start
mcp-gateway-http              # HTTP server (port 3100)
mcp-gateway-stdio             # stdio MCP server (Claude Desktop)`}</pre>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
