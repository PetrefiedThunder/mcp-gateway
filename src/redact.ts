/**
 * Field-level redaction for audit log entries.
 * 
 * Supports:
 * - Redacting specific JSON fields by path (e.g., "ssn", "credit_card")
 * - Pattern-based redaction (SSN, credit card, phone)
 * - Per-server and per-tool redaction rules
 * 
 * Critical for HIPAA, PCI-DSS, and SOC 2 compliance.
 */

export interface RedactionConfig {
  enabled: boolean;
  rules: RedactionRule[];
}

export interface RedactionRule {
  server?: string;
  tool?: string;
  fields?: string[];          // JSON field names to redact
  patterns?: RedactionPattern[];
}

export type RedactionPattern = "ssn" | "credit_card" | "phone" | "email" | "ip";

const PATTERNS: Record<RedactionPattern, RegExp> = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
  phone: /\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

export class Redactor {
  constructor(private config: RedactionConfig) {}

  /**
   * Redact sensitive data from a string based on matching rules.
   */
  redact(value: string, serverId: string, toolName: string): string {
    if (!this.config.enabled) return value;

    let result = value;

    for (const rule of this.config.rules) {
      if (rule.server && !globMatch(rule.server, serverId)) continue;
      if (rule.tool && !globMatch(rule.tool, toolName)) continue;

      // Pattern-based redaction
      if (rule.patterns) {
        for (const pat of rule.patterns) {
          const regex = PATTERNS[pat];
          if (regex) {
            result = result.replace(regex, `[REDACTED:${pat}]`);
          }
        }
      }

      // Field-based redaction (JSON)
      if (rule.fields) {
        try {
          const parsed = JSON.parse(result);
          for (const field of rule.fields) {
            redactField(parsed, field);
          }
          result = JSON.stringify(parsed);
        } catch {
          // Not JSON, try key-value pattern matching
          for (const field of rule.fields) {
            const fieldRegex = new RegExp(`"${field}"\\s*:\\s*"[^"]*"`, "g");
            result = result.replace(fieldRegex, `"${field}":"[REDACTED]"`);
          }
        }
      }
    }

    return result;
  }
}

function redactField(obj: any, path: string): void {
  if (!obj || typeof obj !== "object") return;

  const parts = path.split(".");
  const key = parts[0];

  if (parts.length === 1) {
    if (key in obj) {
      obj[key] = "[REDACTED]";
    }
    // Also check nested objects/arrays
    for (const v of Object.values(obj)) {
      if (typeof v === "object" && v !== null) redactField(v, path);
    }
  } else {
    if (obj[key] && typeof obj[key] === "object") {
      redactField(obj[key], parts.slice(1).join("."));
    }
  }
}

function globMatch(pattern: string, value: string): boolean {
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  return regex.test(value);
}
