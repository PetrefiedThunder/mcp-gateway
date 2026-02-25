/**
 * Multi-tenant workspace isolation.
 * 
 * Each tenant (organization) gets:
 * - Isolated server registry
 * - Isolated policy set
 * - Isolated audit log (separate DB or schema)
 * - Isolated metering
 * - Separate API keys
 * 
 * Tenants are identified by X-Tenant-Id header or embedded in API key.
 */

import type { GatewayConfig, ConsumerContext } from "./types.js";

export interface TenantConfig {
  enabled: boolean;
  tenants: TenantDef[];
  isolation: "schema" | "database" | "namespace";
}

export interface TenantDef {
  id: string;
  name: string;
  config: Partial<GatewayConfig>;  // overrides for this tenant
  quotas?: {
    maxServers?: number;
    maxKeysPerConsumer?: number;
    maxCallsPerDay?: number;
    maxStorageMb?: number;
  };
  enabled: boolean;
}

export class TenantManager {
  private tenants = new Map<string, TenantDef>();
  // Maps API key prefix to tenant
  private keyTenantMap = new Map<string, string>();

  constructor(config: TenantConfig) {
    if (config.enabled) {
      for (const t of config.tenants) {
        this.tenants.set(t.id, t);
        // Index API keys to tenants
        if (t.config.auth?.keys) {
          for (const k of t.config.auth.keys) {
            this.keyTenantMap.set(k.key, t.id);
          }
        }
      }
    }
  }

  /**
   * Resolve tenant from request context.
   */
  resolve(tenantHeader?: string, apiKey?: string): TenantDef | null {
    // Explicit header
    if (tenantHeader) {
      const t = this.tenants.get(tenantHeader);
      if (t?.enabled) return t;
    }

    // Resolve from API key
    if (apiKey) {
      const tenantId = this.keyTenantMap.get(apiKey);
      if (tenantId) {
        const t = this.tenants.get(tenantId);
        if (t?.enabled) return t;
      }
    }

    return null;
  }

  getTenant(id: string): TenantDef | undefined {
    return this.tenants.get(id);
  }

  listTenants(): TenantDef[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Check if a tenant has exceeded their daily quota.
   */
  checkQuota(tenantId: string, currentDailyCalls: number): { allowed: boolean; reason?: string } {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return { allowed: false, reason: "Unknown tenant" };

    if (tenant.quotas?.maxCallsPerDay && currentDailyCalls >= tenant.quotas.maxCallsPerDay) {
      return { allowed: false, reason: `Daily call quota exceeded (${tenant.quotas.maxCallsPerDay})` };
    }

    return { allowed: true };
  }
}
