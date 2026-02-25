import { createHash } from "crypto";
import type { AuthConfig, ApiKeyConfig, ConsumerContext } from "./types.js";

export class Authenticator {
  private keyMap = new Map<string, ApiKeyConfig>();

  constructor(private config: AuthConfig) {
    if (config.keys) {
      for (const k of config.keys) {
        this.keyMap.set(k.key, k);
      }
    }
  }

  authenticate(credentials: string | undefined): ConsumerContext | null {
    if (this.config.type === "none") {
      return { consumerId: "anonymous", apiKeyId: "none", roles: ["*"] };
    }

    if (!credentials) return null;

    if (this.config.type === "api-key") {
      return this.authenticateApiKey(credentials);
    }

    // JWT support placeholder
    return null;
  }

  private authenticateApiKey(key: string): ConsumerContext | null {
    // Try raw key match first
    let config = this.keyMap.get(key);

    // Try hashed match
    if (!config) {
      const hashed = hashKey(key);
      config = this.keyMap.get(hashed);
    }

    if (!config) return null;
    if (!config.enabled) return null;

    // Check expiry
    if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
      return null;
    }

    return {
      consumerId: config.consumerId,
      apiKeyId: config.id,
      roles: config.roles,
      rateLimit: config.rateLimit,
    };
  }

  reload(config: AuthConfig) {
    this.config = config;
    this.keyMap.clear();
    if (config.keys) {
      for (const k of config.keys) {
        this.keyMap.set(k.key, k);
      }
    }
  }
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "gw_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
