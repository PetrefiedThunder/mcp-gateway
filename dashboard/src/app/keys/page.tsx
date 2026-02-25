"use client";

import { useState } from "react";

interface ApiKey {
  id: string;
  name: string;
  consumerId: string;
  roles: string[];
  enabled: boolean;
  expiresAt?: string;
}

export default function KeysPage() {
  const [keys] = useState<ApiKey[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">API Keys</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
        >
          + Create Key
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h3 className="font-bold mb-4">Create API Key</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Use the CLI to create keys (dashboard key management coming soon):
          </p>
          <pre className="bg-black rounded-lg p-4 text-sm text-green-400">
{`# Create a new API key
mcp-gateway keys create "My Agent" agent-1 reader,writer

# List existing keys
mcp-gateway keys list

# Revoke a key
mcp-gateway keys revoke key-123`}
          </pre>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-card)]">
            <tr className="text-left text-[var(--text-muted)] text-xs uppercase tracking-wide">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Consumer</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Expires</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2.5 font-mono text-xs">{k.id}</td>
                <td className="px-4 py-2.5">{k.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{k.consumerId}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {k.roles.map((r) => (
                      <span key={r} className="px-1.5 py-0.5 bg-[var(--bg)] rounded text-xs">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={k.enabled ? "text-[var(--success)]" : "text-[var(--error)]"}>
                    {k.enabled ? "Active" : "Revoked"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                  {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never"}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Keys are managed via CLI and gateway.yaml. Dashboard management coming soon.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
