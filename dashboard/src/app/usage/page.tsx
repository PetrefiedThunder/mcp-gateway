"use client";

import { useEffect, useState } from "react";

interface UsageData {
  totalCalls: number;
  totalErrors: number;
  avgLatencyMs: number;
  byServer: Record<string, number>;
  byTool: Record<string, number>;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/gateway/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  if (!usage) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Usage & Metering</h2>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-[var(--text-muted)]">
          Loading usage data...
        </div>
      </div>
    );
  }

  const errorRate = usage.totalCalls > 0 ? ((usage.totalErrors / usage.totalCalls) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Usage & Metering</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Calls" value={usage.totalCalls.toLocaleString()} color="var(--accent)" />
        <MetricCard label="Errors" value={usage.totalErrors.toLocaleString()} color="var(--error)" />
        <MetricCard label="Error Rate" value={`${errorRate}%`} color={parseFloat(errorRate) > 5 ? "var(--error)" : "var(--success)"} />
        <MetricCard label="Avg Latency" value={`${Math.round(usage.avgLatencyMs || 0)}ms`} color="var(--warning)" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* By Server */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">By Server</h3>
          <div className="space-y-3">
            {Object.entries(usage.byServer)
              .sort(([, a], [, b]) => b - a)
              .map(([server, calls]) => {
                const pct = usage.totalCalls > 0 ? (calls / usage.totalCalls) * 100 : 0;
                return (
                  <div key={server}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-mono">{server}</span>
                      <span className="text-[var(--text-muted)]">{calls.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* By Tool */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">By Tool</h3>
          <div className="space-y-3">
            {Object.entries(usage.byTool)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 15)
              .map(([tool, calls]) => {
                const pct = usage.totalCalls > 0 ? (calls / usage.totalCalls) * 100 : 0;
                return (
                  <div key={tool}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-mono text-xs">{tool}</span>
                      <span className="text-[var(--text-muted)] text-xs">{calls.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--success)] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}
