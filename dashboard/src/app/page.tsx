"use client";

import { useEffect, useState } from "react";

interface HealthData {
  status: string;
  version: string;
  uptime: number;
  servers: Record<string, { status: string; tools: number; uptime?: number; lastError?: string }>;
}

interface AuditStats {
  total: number;
  byStatus: Record<string, number>;
  byServer: Record<string, number>;
}

export default function Overview() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/gateway/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(e.message));

    fetch("/api/gateway/audit/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {}); // may require auth
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Overview</h2>
        <ConnectionGuide error={error} />
      </div>
    );
  }

  const servers = health?.servers ? Object.entries(health.servers) : [];
  const runningCount = servers.filter(([, s]) => s.status === "running").length;
  const totalTools = servers.reduce((acc, [, s]) => acc + (s.tools || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Overview</h2>
        <StatusBadge status={health?.status || "unknown"} />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Servers" value={`${runningCount}/${servers.length}`} sub="running" color="var(--accent)" />
        <MetricCard label="Tools" value={String(totalTools)} sub="registered" color="var(--success)" />
        <MetricCard label="Total Calls" value={stats?.total?.toLocaleString() || "—"} sub="all time" color="var(--warning)" />
        <MetricCard label="Uptime" value={health ? formatUptime(health.uptime) : "—"} sub="gateway" color="var(--text-muted)" />
      </div>

      {/* Status by Category */}
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <Card title="Calls by Status">
            <div className="space-y-2">
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <StatusDot status={status} />
                    <span className="capitalize text-sm">{status}</span>
                  </span>
                  <span className="font-mono text-sm">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Calls by Server">
            <div className="space-y-2">
              {Object.entries(stats.byServer)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([server, count]) => (
                  <div key={server} className="flex justify-between items-center">
                    <span className="text-sm font-mono">{server}</span>
                    <span className="font-mono text-sm">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}

      {/* Server List */}
      <Card title="Servers">
        <div className="space-y-2">
          {servers.map(([id, server]) => (
            <div key={id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
              <div className="flex items-center gap-3">
                <StatusDot status={server.status === "running" ? "success" : "error"} />
                <span className="font-mono text-sm">{id}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                <span>{server.tools} tools</span>
                {server.uptime && <span>{formatUptime(server.uptime / 1000)}</span>}
                {server.lastError && (
                  <span className="text-[var(--error)] max-w-xs truncate" title={server.lastError}>
                    {server.lastError}
                  </span>
                )}
              </div>
            </div>
          ))}
          {servers.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No servers registered. Add servers to gateway.yaml.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color }}>{value}</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "ok" ? "var(--success)" : "var(--error)";
  return (
    <span className="px-3 py-1 rounded-full text-xs font-medium border" style={{ borderColor: color, color }}>
      {status === "ok" ? "● Healthy" : "● " + status}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "var(--success)", running: "var(--success)",
    error: "var(--error)", denied: "var(--denied)",
    "rate-limited": "var(--warning)",
  };
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: colors[status] || "var(--text-muted)" }} />;
}

function ConnectionGuide({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 max-w-lg">
      <p className="text-[var(--error)] text-sm mb-4">Cannot connect to gateway: {error}</p>
      <p className="text-sm text-[var(--text-muted)] mb-4">Make sure the gateway is running:</p>
      <pre className="bg-black rounded-lg p-4 text-sm text-green-400 overflow-x-auto">
{`# Start the gateway HTTP server
cd mcp-gateway
node dist/serve.js

# Or with Docker Compose
docker-compose up -d`}
      </pre>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}
