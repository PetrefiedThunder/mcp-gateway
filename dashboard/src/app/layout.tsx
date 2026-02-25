import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCP Gateway — Dashboard",
  description: "Enterprise infrastructure for Model Context Protocol",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

function Sidebar() {
  const links = [
    { href: "/", label: "Overview", icon: "📊" },
    { href: "/servers", label: "Servers", icon: "🖥️" },
    { href: "/audit", label: "Audit Log", icon: "📋" },
    { href: "/usage", label: "Usage", icon: "📈" },
    { href: "/keys", label: "API Keys", icon: "🔑" },
    { href: "/policies", label: "Policies", icon: "🛡️" },
    { href: "/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <aside className="w-56 border-r border-[var(--border)] bg-[var(--bg)] p-4 flex flex-col gap-1">
      <div className="mb-6 px-3">
        <h1 className="text-lg font-bold tracking-tight">🔐 MCP Gateway</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">Enterprise Control Plane</p>
      </div>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors"
        >
          <span>{l.icon}</span>
          <span>{l.label}</span>
        </a>
      ))}
      <div className="mt-auto pt-4 border-t border-[var(--border)] px-3">
        <p className="text-xs text-[var(--text-muted)]">v1.0.0</p>
      </div>
    </aside>
  );
}
