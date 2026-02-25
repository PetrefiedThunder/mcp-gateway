import type { PolicyConfig, PolicyRule, ConsumerContext } from "./types.js";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  matchedRule?: PolicyRule;
}

export class PolicyEngine {
  constructor(private policies: PolicyConfig[]) {}

  evaluate(
    ctx: ConsumerContext,
    serverId: string,
    toolName: string,
    args?: Record<string, any>
  ): PolicyDecision {
    // Collect all rules that apply to this consumer's roles
    const applicableRules: { rule: PolicyRule; policyName: string }[] = [];

    for (const policy of this.policies) {
      const roleMatch = policy.roles.some((r) =>
        r === "*" || ctx.roles.includes(r)
      );
      if (!roleMatch) continue;

      for (const rule of policy.rules) {
        if (rule.server && !globMatch(rule.server, serverId)) continue;
        if (rule.tool && !globMatch(rule.tool, toolName)) continue;
        applicableRules.push({ rule, policyName: policy.name });
      }
    }

    // No rules = default deny
    if (applicableRules.length === 0) {
      return { allowed: false, reason: "No matching policy rules (default deny)" };
    }

    // Evaluate rules in order — first match wins (like firewall rules).
    // More specific rules (with server+tool set) are evaluated before wildcards.
    // Sort: specific deny/allow first, then wildcards.
    const sorted = [...applicableRules].sort((a, b) => {
      const specA = (a.rule.server && a.rule.server !== "*" ? 1 : 0) + (a.rule.tool && a.rule.tool !== "*" ? 1 : 0);
      const specB = (b.rule.server && b.rule.server !== "*" ? 1 : 0) + (b.rule.tool && b.rule.tool !== "*" ? 1 : 0);
      return specB - specA; // more specific first
    });

    for (const { rule, policyName } of sorted) {
      if (rule.conditions && args) {
        const conditionsMet = rule.conditions.every((c) => evaluateCondition(c, args));
        if (!conditionsMet) continue;
      }

      if (rule.action === "deny") {
        return {
          allowed: false,
          reason: `Denied by policy "${policyName}": ${rule.tool || "*"} on ${rule.server || "*"}`,
          matchedRule: rule,
        };
      }

      if (rule.action === "allow") {
        return { allowed: true, matchedRule: rule };
      }
    }

    return { allowed: false, reason: "No matching rule" };
  }

  reload(policies: PolicyConfig[]) {
    this.policies = policies;
  }
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  if (pattern.startsWith("*")) {
    return value.endsWith(pattern.slice(1));
  }
  return pattern === value;
}

function evaluateCondition(
  condition: { param: string; operator: string; value: string | string[] },
  args: Record<string, any>
): boolean {
  const actual = args[condition.param];
  if (actual === undefined) return false;

  switch (condition.operator) {
    case "eq":
      return String(actual) === String(condition.value);
    case "neq":
      return String(actual) !== String(condition.value);
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(String(actual));
    case "regex":
      try { return new RegExp(String(condition.value)).test(String(actual)); }
      catch { return false; }
    default:
      return false;
  }
}
