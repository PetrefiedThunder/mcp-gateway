// Core domain types for MCP Gateway

export interface GatewayConfig {
  port?: number;
  host?: string;
  auth: AuthConfig;
  servers: ServerConfig[];
  policies: PolicyConfig[];
  audit: AuditConfig;
  metering: MeteringConfig;
  rateLimit?: RateLimitConfig;
}

export interface AuthConfig {
  type: "api-key" | "jwt" | "oidc" | "none";
  keys?: ApiKeyConfig[];
  jwt?: JwtConfig;
  oidc?: OidcConfig;
}

export interface ApiKeyConfig {
  id: string;
  key: string;            // hashed
  name: string;           // display name
  consumerId: string;     // who owns this key
  roles: string[];        // role assignments
  rateLimit?: number;     // per-minute override
  expiresAt?: string;     // ISO date
  enabled: boolean;
}

export interface JwtConfig {
  secret?: string;
  publicKey?: string;
  issuer?: string;
  audience?: string;
  rolesField?: string;       // JWT claim containing roles (default: "roles")
  consumerIdField?: string;  // JWT claim containing consumer ID (default: "sub")
}

export interface OidcConfig {
  issuerUrl: string;          // e.g. https://accounts.google.com
  clientId: string;
  audience?: string;
  rolesField?: string;        // claim in ID token with roles
  consumerIdField?: string;   // claim for consumer identity
  jwksUri?: string;           // auto-discovered if not set
  allowedDomains?: string[];  // restrict to email domains
}

export interface ServerConfig {
  id: string;
  name: string;
  command: string;        // e.g. "node"
  args: string[];         // e.g. ["./dist/index.js"]
  env?: Record<string, string>;  // secrets injected here
  tags?: string[];
  enabled: boolean;
  timeout?: number;       // ms
  maxMemory?: number;     // bytes
  healthCheck?: boolean;
}

export interface PolicyConfig {
  id: string;
  name: string;
  roles: string[];        // which roles this policy applies to
  rules: PolicyRule[];
}

export interface PolicyRule {
  server?: string;        // server ID glob (e.g. "mcp-*")
  tool?: string;          // tool name glob (e.g. "delete_*")
  action: "allow" | "deny";
  conditions?: PolicyCondition[];
}

export interface PolicyCondition {
  param: string;          // parameter name
  operator: "eq" | "neq" | "in" | "regex";
  value: string | string[];
}

export interface AuditConfig {
  enabled: boolean;
  storage: "sqlite" | "postgres" | "webhook";
  path?: string;          // SQLite path
  dsn?: string;           // Postgres DSN
  webhookUrl?: string;
  retentionDays?: number;
  hashChain?: boolean;    // tamper-evident
  export?: AuditExportConfig;
}

export interface AuditExportConfig {
  type: "s3" | "webhook" | "file";
  destination: string;    // S3 bucket, webhook URL, or file path
  format: "jsonl" | "csv";
  intervalMs?: number;    // export frequency
  batchSize?: number;     // entries per export
}

export interface MeteringConfig {
  enabled: boolean;
  dimensions: ("calls" | "latency" | "errors")[];
  flushIntervalMs?: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  defaultPerMinute: number;
  burstMultiplier?: number;
}

// Runtime types
export interface AuditEntry {
  id: string;
  timestamp: string;
  consumerId: string;
  apiKeyId: string;
  serverId: string;
  tool: string;
  args: string;           // JSON stringified (redacted if needed)
  response: string;       // JSON stringified (truncated)
  latencyMs: number;
  status: "success" | "error" | "denied" | "rate-limited";
  error?: string;
  prevHash?: string;      // hash chain
  hash?: string;
}

export interface MeterEntry {
  consumerId: string;
  serverId: string;
  tool: string;
  calls: number;
  errors: number;
  totalLatencyMs: number;
  periodStart: string;
  periodEnd: string;
}

export interface ConsumerContext {
  consumerId: string;
  apiKeyId: string;
  roles: string[];
  rateLimit?: number;
  email?: string;
  metadata?: Record<string, any>;
}
