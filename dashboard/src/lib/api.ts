const BASE = process.env.NEXT_PUBLIC_GATEWAY_URL || "";

async function gw(path: string, apiKey?: string) {
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  const res = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function getHealth() { return gw("/api/gateway/health"); }
export async function getServers(apiKey?: string) { return gw("/api/gateway/servers", apiKey); }
export async function getTools(apiKey?: string) { return gw("/api/gateway/tools", apiKey); }
export async function getAuditLog(apiKey?: string, params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return gw(`/api/gateway/audit${qs}`, apiKey);
}
export async function getAuditStats(apiKey?: string) { return gw("/api/gateway/audit/stats", apiKey); }
export async function getAuditVerify(apiKey?: string) { return gw("/api/gateway/audit/verify", apiKey); }
export async function getUsage(apiKey?: string, consumer?: string) {
  const qs = consumer ? `?consumer=${consumer}` : "";
  return gw(`/api/gateway/usage${qs}`, apiKey);
}
