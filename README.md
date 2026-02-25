# mcp-gateway

**The enterprise infrastructure layer for MCP.** Authentication, authorization, audit logging, rate limiting, usage metering, and secret management — for AI agents calling MCP tools in production.

Think: **Cloudflare + Okta + Datadog**, but for Model Context Protocol.

## Why

MCP today: agent → server. Direct connection. No auth, no audit trail, no rate limits, no billing, no secret management.

That's fine for demos. It's not fine for:
- **Healthcare** (HIPAA audit requirements)
- **Finance** (SOC 2, regulatory compliance)
- **Enterprise** (RBAC, cost allocation, security)

MCP Gateway sits between agents and servers, enforcing policy on every tool call.

```
Agent (Claude, GPT, etc.)
  ↓ MCP protocol
┌──────────────────────────┐
│      MCP Gateway         │
│  Auth → Policy → Audit   │
│  Rate Limit → Meter      │
│  Secrets → Sandbox       │
└──────────────────────────┘
  ↓ MCP protocol
MCP Server (any server)
```

## Five Pillars

### 1. Registry + Discovery
Register MCP servers. Agents discover available tools through the gateway. Multi-tenant: each consumer sees only what they're allowed to see.

### 2. Policy + Permissions (RBAC)
- API key authentication per agent/consumer
- Role-based tool permissions (`reader` can `get_*` and `search_*`, not `delete_*`)
- Server-level restrictions (block access to `mcp-stripe` for read-only agents)
- Parameter-level conditions (only allow queries for own customer ID)

### 3. Audit + Provenance
- Every tool call logged: who, what, when, args, response, latency
- **Tamper-evident hash chain** — each entry hashes the previous, detectable if modified
- Exportable to S3, webhook, SIEM
- Query by consumer, server, tool, status, time range

### 4. Metering + Billing
- Usage tracking per consumer, per server, per tool
- Calls, latency, error rates
- Cost allocation for chargeback
- Stripe integration ready

### 5. Runtime Sandbox + Secrets
- MCP servers run as managed child processes
- Secrets injected via environment variables — never exposed to agents
- Timeout enforcement, automatic restart on crash
- Server health monitoring

## Quick Start

```bash
# Install
git clone https://github.com/PetrefiedThunder/mcp-gateway.git
cd mcp-gateway
npm install && npm run build

# Generate config
npx mcp-gateway init

# Edit gateway.yaml with your servers and API keys

# Start the gateway (as an MCP server)
npx mcp-gateway serve
```

## Configuration

The gateway is configured via `gateway.yaml`:

```yaml
auth:
  type: api-key
  keys:
    - id: key-1
      key: gw_your_key_here
      name: "Production Agent"
      consumerId: agent-prod
      roles: [reader, writer]
      enabled: true

servers:
  - id: mcp-fred
    name: "Federal Reserve Economic Data"
    command: node
    args: ["./mcp-fred/dist/index.js"]
    enabled: true

  - id: mcp-stripe
    name: "Stripe Payments"
    command: node
    args: ["./mcp-stripe/dist/index.js"]
    env:
      STRIPE_SECRET_KEY: "${STRIPE_SECRET_KEY}"
    enabled: true

policies:
  - id: reader-policy
    name: "Read-only access"
    roles: [reader]
    rules:
      - tool: "get_*"
        action: allow
      - tool: "search_*"
        action: allow
      - tool: "*"
        action: deny

  - id: admin-policy
    name: "Full access"
    roles: [admin]
    rules:
      - action: allow

audit:
  enabled: true
  storage: sqlite
  path: ./gateway-audit.db
  hashChain: true

metering:
  enabled: true
  dimensions: [calls, latency, errors]

rateLimit:
  enabled: true
  defaultPerMinute: 60
```

## CLI

```bash
# API Key Management
mcp-gateway keys list
mcp-gateway keys create "My Agent" agent-1 reader,writer
mcp-gateway keys revoke key-123

# Server Management
mcp-gateway servers list

# Audit
mcp-gateway audit log --limit=50
mcp-gateway audit stats
mcp-gateway audit verify    # verify hash chain integrity

# Usage
mcp-gateway usage
mcp-gateway usage agent-1
```

## Gateway Tools (MCP Interface)

The gateway itself is an MCP server. Connect to it and use these tools:

| Tool | Description |
|------|-------------|
| `call` | Call any registered tool through the auth/policy/audit pipeline |
| `list_tools` | List available tools (filtered by caller permissions) |
| `list_servers` | List registered MCP servers and status |
| `server_status` | Detailed server health status |
| `audit_log` | Query the audit log |
| `audit_verify` | Verify tamper-evident hash chain |
| `audit_stats` | Audit statistics |
| `usage` | Usage metrics by consumer |

## Usage with Claude Desktop

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/index.js"],
      "env": {
        "MCP_GATEWAY_CONFIG": "/path/to/gateway.yaml"
      }
    }
  }
}
```

## Architecture

```
src/
├── index.ts          # MCP server entry point
├── cli.ts            # CLI management tool
├── gateway.ts        # Core orchestrator
├── auth.ts           # API key / JWT authentication
├── policy.ts         # RBAC policy engine (glob matching, conditions)
├── audit.ts          # SQLite audit log with hash chain
├── ratelimit.ts      # Token bucket rate limiter
├── meter.ts          # Usage metering and aggregation
├── registry.ts       # Server lifecycle management
├── proxy.ts          # MCP JSON-RPC proxy (stdio)
└── types.ts          # TypeScript domain types
```

## License

MIT
