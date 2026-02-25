"use client";

export default function PoliciesPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Policies</h2>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h3 className="font-bold mb-4">Policy Model</h3>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          MCP Gateway uses a <strong className="text-[var(--text)]">default-deny</strong> RBAC policy engine.
          Policies are defined in <code className="text-[var(--accent)]">gateway.yaml</code>.
        </p>

        <div className="space-y-4">
          <div className="bg-[var(--bg)] rounded-lg p-4">
            <h4 className="text-sm font-bold mb-2">How it works</h4>
            <ul className="text-sm text-[var(--text-muted)] space-y-1.5">
              <li>• Each API key has <strong className="text-[var(--text)]">roles</strong> (e.g., reader, writer, admin)</li>
              <li>• Policies map roles → rules (allow/deny on server + tool globs)</li>
              <li>• More specific rules (server + tool set) are evaluated before wildcards</li>
              <li>• If no rule matches → <strong className="text-[var(--error)]">denied</strong></li>
              <li>• Conditions can match on tool arguments (e.g., only allow queries for own data)</li>
            </ul>
          </div>

          <div className="bg-[var(--bg)] rounded-lg p-4">
            <h4 className="text-sm font-bold mb-2">Example Policy</h4>
            <pre className="text-xs text-green-400 overflow-x-auto">{`policies:
  - id: reader-policy
    name: "Read-only access"
    roles: [reader]
    rules:
      - tool: "get_*"
        action: allow
      - tool: "search_*"
        action: allow
      - tool: "*"
        action: deny    # deny everything else

  - id: admin-policy
    name: "Full access"
    roles: [admin]
    rules:
      - action: allow   # allow everything`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
