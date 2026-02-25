"use client";

import { useEffect, useState } from "react";

interface Server {
  id: string;
  name: string;
  status: string;
  tools: string[];
  tags?: string[];
}

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selected, setSelected] = useState<Server | null>(null);

  useEffect(() => {
    fetch("/api/gateway/servers")
      .then((r) => r.json())
      .then(setServers)
      .catch(() => {});
  }, []);

  const statusColor = (s: string) =>
    s === "running" ? "var(--success)" : s === "error" ? "var(--error)" : "var(--text-muted)";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Servers</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.map((s) => (
          <div
            key={s.id}
            onClick={() => setSelected(s)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono font-bold text-sm">{s.id}</h3>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium border"
                style={{ borderColor: statusColor(s.status), color: statusColor(s.status) }}
              >
                {s.status}
              </span>
            </div>
            {s.name && <p className="text-sm text-[var(--text-muted)] mb-2">{s.name}</p>}
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{s.tools.length} tools</span>
              {s.tags && (
                <div className="flex gap-1">
                  {s.tags.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 bg-[var(--bg)] rounded text-[10px]">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {servers.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-[var(--text-muted)]">No servers registered</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">Add servers to <code className="text-[var(--accent)]">gateway.yaml</code></p>
        </div>
      )}

      {/* Tool Detail */}
      {selected && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">{selected.id} — Tools</h3>
            <button onClick={() => setSelected(null)} className="text-[var(--text-muted)] hover:text-[var(--text)]">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {selected.tools.map((tool) => (
              <div key={tool} className="px-3 py-2 bg-[var(--bg)] rounded-lg text-xs font-mono">
                {tool}
              </div>
            ))}
          </div>
          {selected.tools.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No tools discovered yet. Server may need initialization.</p>
          )}
        </div>
      )}
    </div>
  );
}
