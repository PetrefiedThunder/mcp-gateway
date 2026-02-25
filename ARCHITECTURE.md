# MCP Gateway — Architecture

## What Is This

The missing enterprise layer for MCP. Sits between AI agents and MCP servers.
Like Cloudflare sits in front of web servers — but for tool calls.

## The Problem

MCP today: agent → server. Direct. No auth, no audit, no limits, no billing.
Enterprise won't touch it. Healthcare can't touch it. Finance can't touch it.

## The Product

```
Agent (Claude, GPT, etc.)
  ↓ MCP protocol (stdio or SSE)
┌─────────────────────────────┐
│         MCP Gateway         │
│  ┌───────────────────────┐  │
│  │ Auth (API key / OAuth) │  │
│  ├───────────────────────┤  │
│  │ Policy (RBAC + scopes) │  │
│  ├───────────────────────┤  │
│  │ Audit (every call log) │  │
│  ├───────────────────────┤  │
│  │ Meter (usage tracking) │  │
│  ├───────────────────────┤  │
│  │ Secrets (env injection) │  │
│  ├───────────────────────┤  │
│  │ Sandbox (isolation)    │  │
│  └───────────────────────┘  │
│         Registry            │
│   (server discovery + cfg)  │
└─────────────────────────────┘
  ↓ MCP protocol (stdio)
MCP Server (any server)
```

## Five Pillars

### 1. Registry + Discovery
- Register MCP servers with metadata (tools, schemas, tags)
- Agents discover available tools via `tools/list` through gateway
- Server health checks, versioning, canary deploys
- Multi-tenant: each org sees their own registry

### 2. Policy + Permissions
- API key authentication per agent/consumer
- RBAC: roles → tool permissions (allow/deny per tool)
- Scoping: parameter-level restrictions (e.g. "can only query own customer ID")
- Rate limiting per consumer, per tool, per time window
- IP allowlists, mTLS for server-to-server

### 3. Audit + Provenance
- Every tool call logged: who, what, when, args, response, latency
- Immutable append-only audit log
- Exportable (S3, webhook, SIEM integration)
- Data residency controls (EU, US)
- Tamper-evident chain (hash-linked entries)

### 4. Metering + Billing
- Usage tracking per consumer, per server, per tool
- Configurable billing dimensions (calls, compute time, data volume)
- Usage dashboards + alerts
- Stripe integration for usage-based billing
- Cost allocation tags for chargeback

### 5. Runtime Sandbox + Secrets
- MCP servers run in isolated processes/containers
- Secrets injected as env vars, never exposed to agents
- Timeout enforcement, memory limits
- Network policy (which servers can reach which endpoints)
- Automatic restart on crash

## Tech Stack
- **Gateway core:** TypeScript (Node.js)
- **Storage:** SQLite (embedded) → PostgreSQL (scale)
- **Config:** YAML/JSON config files
- **Transport:** stdio proxy + HTTP/SSE endpoint
- **Auth:** JWT + API keys
- **Packaging:** npm + Docker

## MVP Scope
1. Gateway proxy (stdio ↔ stdio)
2. API key auth
3. Tool-level RBAC
4. Audit logging (SQLite)
5. Rate limiting
6. Secret injection
7. CLI for management
8. Config-driven (YAML)
