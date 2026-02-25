import { createHash, createVerify } from "crypto";
import jwt from "jsonwebtoken";
import type { AuthConfig, ApiKeyConfig, ConsumerContext } from "./types.js";

// JWKS cache for OIDC
const jwksCache = new Map<string, { keys: any[]; fetchedAt: number }>();

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

    // API key auth
    if (this.config.type === "api-key") {
      return this.authenticateApiKey(credentials);
    }

    // JWT auth (synchronous — pre-shared secret or RSA public key)
    if (this.config.type === "jwt" && this.config.jwt) {
      return this.authenticateJwt(credentials);
    }

    // For OIDC, use authenticateAsync
    return null;
  }

  /**
   * Async auth — required for OIDC (needs to fetch JWKS).
   */
  async authenticateAsync(credentials: string | undefined): Promise<ConsumerContext | null> {
    // Try sync auth first
    const syncResult = this.authenticate(credentials);
    if (syncResult) return syncResult;

    if (!credentials) return null;

    // OIDC with remote JWKS
    if (this.config.type === "oidc" && this.config.oidc) {
      return this.authenticateOidc(credentials);
    }

    return null;
  }

  private authenticateJwt(token: string): ConsumerContext | null {
    const jwtConfig = this.config.jwt!;
    const secret = jwtConfig.publicKey || jwtConfig.secret;
    if (!secret) return null;

    try {
      const decoded = jwt.verify(token, secret, {
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
      }) as any;

      const consumerId = decoded[jwtConfig.consumerIdField || "sub"] || "unknown";
      const roles = decoded[jwtConfig.rolesField || "roles"] || [];

      return {
        consumerId,
        apiKeyId: `jwt:${decoded.jti || consumerId}`,
        roles: Array.isArray(roles) ? roles : [roles],
        email: decoded.email,
        metadata: { iss: decoded.iss, exp: decoded.exp },
      };
    } catch {
      return null;
    }
  }

  private async authenticateOidc(token: string): Promise<ConsumerContext | null> {
    const oidcConfig = this.config.oidc!;

    try {
      // Decode header to find kid
      const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
      const kid = header.kid;

      // Fetch JWKS
      const jwksUri = oidcConfig.jwksUri || `${oidcConfig.issuerUrl}/.well-known/jwks.json`;
      const keys = await this.fetchJwks(jwksUri);
      const jwk = keys.find((k: any) => k.kid === kid);
      if (!jwk) return null;

      // Convert JWK to PEM (simplified for RSA)
      const pem = jwkToPem(jwk);

      const decoded = jwt.verify(token, pem, {
        issuer: oidcConfig.issuerUrl,
        audience: oidcConfig.audience || oidcConfig.clientId,
      }) as any;

      // Domain restriction
      if (oidcConfig.allowedDomains?.length && decoded.email) {
        const domain = decoded.email.split("@")[1];
        if (!oidcConfig.allowedDomains.includes(domain)) return null;
      }

      const consumerId = decoded[oidcConfig.consumerIdField || "sub"] || "unknown";
      const roles = decoded[oidcConfig.rolesField || "roles"] || ["reader"];

      return {
        consumerId,
        apiKeyId: `oidc:${decoded.sub}`,
        roles: Array.isArray(roles) ? roles : [roles],
        email: decoded.email,
        metadata: { iss: decoded.iss, provider: "oidc" },
      };
    } catch {
      return null;
    }
  }

  private async fetchJwks(uri: string): Promise<any[]> {
    const cached = jwksCache.get(uri);
    if (cached && Date.now() - cached.fetchedAt < 3600000) {
      return cached.keys;
    }

    const res = await fetch(uri);
    const data = await res.json() as any;
    jwksCache.set(uri, { keys: data.keys, fetchedAt: Date.now() });
    return data.keys;
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

/**
 * Minimal JWK (RSA) to PEM conversion.
 * Handles RS256 keys from OIDC providers (Google, Okta, Auth0, etc.)
 */
function jwkToPem(jwk: any): string {
  if (jwk.x5c?.length) {
    // Use X.509 certificate chain if available
    return `-----BEGIN CERTIFICATE-----\n${jwk.x5c[0].match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
  }

  // Fallback: construct RSA public key from n + e
  const n = Buffer.from(jwk.n, "base64url");
  const e = Buffer.from(jwk.e, "base64url");

  // DER encode RSA public key
  const nLen = encodeLenDer(n.length);
  const eLen = encodeLenDer(e.length);

  const rsaPubKey = Buffer.concat([
    Buffer.from([0x30]), encodeLenDer(2 + nLen.length + n.length + 2 + eLen.length + e.length),
    Buffer.from([0x02]), nLen, n.length > 0 && n[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), n]) : n,
    Buffer.from([0x02]), eLen, e,
  ]);

  // Recalculate with possible padding byte
  const nPad = n.length > 0 && n[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), n]) : n;
  const nLenFinal = encodeLenDer(nPad.length);
  const eLenFinal = encodeLenDer(e.length);
  const innerLen = 1 + nLenFinal.length + nPad.length + 1 + eLenFinal.length + e.length;

  const body = Buffer.concat([
    Buffer.from([0x30]), encodeLenDer(innerLen),
    Buffer.from([0x02]), nLenFinal, nPad,
    Buffer.from([0x02]), eLenFinal, e,
  ]);

  // Wrap in SEQUENCE with algorithm OID for RSA
  const oid = Buffer.from("300d06092a864886f70d0101010500", "hex");
  const bitString = Buffer.concat([Buffer.from([0x03]), encodeLenDer(body.length + 1), Buffer.from([0x00]), body]);
  const der = Buffer.concat([Buffer.from([0x30]), encodeLenDer(oid.length + bitString.length), oid, bitString]);

  const b64 = der.toString("base64").match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
}

function encodeLenDer(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}
