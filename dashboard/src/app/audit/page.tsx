"use client";

import { useEffect, useState } from "react";

interface AuditEntry {
  id: string;
  timestamp: string;
  consumerId: string;
  apiKeyId: string;
  serverId: string;
  tool: string;
  status: string;
  latencyMs: number;
  error?: string;
  args?: string;
  response?: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", serverId: "", limit: "50" });
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [chainStatus, setChainStatus] = useState<{ valid: boolean; brokenAt?: string } | null>(null);

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.serverId) params.set("serverId", filters.serverId);
    params.set("limit", filters.limit);

    fetch(`/api/gateway/audit?${params}`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const verifyChain = () => {
    fetch("/api/gateway/audit/verify")
      .then((r) => r.json())
      .then(setChainStatus);
  };

  const statusColors: Record<string, string> = {
    success: "text-[var(--success)]",
    error: "text-[var(--error)]",
    denied: "text-[var(--denied)]",
    "rate-limited": "text-[var(--warning)]",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Audit Log</h2>
        <div className="flex gap-2">
          <button
            onClick={verifyChain}
            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--bg-card)] transition-colors"
          >
            🔗 Verify Chain
          </button>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {chainStatus && (
        <div className={`p-3 rounded-lg text-sm ${chainStatus.valid ? "bg-green-900/20 text-[var(--success)]" : "bg-red-900/20 text-[var(--error)]"}`}>
          {chainStatus.valid
            ? "✅ Hash chain integrity verified — no tampering detected"
            : `❌ Chain broken at entry: ${chainStatus.brokenAt}`}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="denied">Denied</option>
          <option value="rate-limited">Rate Limited</option>
        </select>
        <input
          placeholder="Server ID..."
          value={filters.serverId}
          onChange={(e) => setFilters((f) => ({ ...f, serverId: e.target.value }))}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm w-48"
        />
        <button onClick={fetchData} className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--bg-card)]">
          Filter
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-card)]">
            <tr className="text-left text-[var(--text-muted)] text-xs uppercase tracking-wide">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Consumer</th>
              <th className="px-4 py-3">Server</th>
              <th className="px-4 py-3">Tool</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Latency</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                onClick={() => setSelected(e)}
                className="border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-muted)]">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.consumerId}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.serverId}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.tool}</td>
                <td className={`px-4 py-2.5 font-mono text-xs font-medium ${statusColors[e.status] || ""}`}>
                  {e.status}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-right">{e.latencyMs}ms</td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No audit entries found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-y-0 right-0 w-[480px] bg-[var(--bg)] border-l border-[var(--border)] p-6 overflow-auto shadow-2xl z-50">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold">Audit Entry</h3>
            <button onClick={() => setSelected(null)} className="text-[var(--text-muted)] hover:text-[var(--text)]">✕</button>
          </div>
          <div className="space-y-4 text-sm">
            <Field label="ID" value={selected.id} />
            <Field label="Timestamp" value={selected.timestamp} />
            <Field label="Consumer" value={selected.consumerId} />
            <Field label="API Key" value={selected.apiKeyId} />
            <Field label="Server" value={selected.serverId} />
            <Field label="Tool" value={selected.tool} />
            <Field label="Status" value={selected.status} />
            <Field label="Latency" value={`${selected.latencyMs}ms`} />
            {selected.error && <Field label="Error" value={selected.error} />}
            {selected.args && (
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">Arguments</p>
                <pre className="bg-black rounded p-3 text-xs overflow-auto max-h-48">{formatJson(selected.args)}</pre>
              </div>
            )}
            {selected.response && (
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">Response</p>
                <pre className="bg-black rounded p-3 text-xs overflow-auto max-h-48">{formatJson(selected.response)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="font-mono text-sm mt-0.5">{value}</p>
    </div>
  );
}

function formatJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
