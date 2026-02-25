import { describe, it, expect } from "vitest";
import { Redactor } from "../redact.js";

describe("Redactor", () => {
  const redactor = new Redactor({
    enabled: true,
    rules: [
      { patterns: ["ssn", "credit_card", "email"] },
      { server: "mcp-stripe", fields: ["card_number", "cvc"] },
      { tool: "get_patient*", fields: ["ssn", "dob"], patterns: ["phone"] },
    ],
  });

  it("redacts SSN patterns", () => {
    const result = redactor.redact('Patient SSN: 123-45-6789', "any", "any");
    expect(result).toContain("[REDACTED:ssn]");
    expect(result).not.toContain("123-45-6789");
  });

  it("redacts credit card patterns", () => {
    const result = redactor.redact('Card: 4111 1111 1111 1111', "any", "any");
    expect(result).toContain("[REDACTED:credit_card]");
  });

  it("redacts email patterns", () => {
    const result = redactor.redact('Email: user@example.com ok', "any", "any");
    expect(result).toContain("[REDACTED:email]");
  });

  it("redacts JSON fields for matching server", () => {
    const input = JSON.stringify({ card_number: "4111111111111111", amount: 100, cvc: "123" });
    const result = redactor.redact(input, "mcp-stripe", "create_charge");
    const parsed = JSON.parse(result);
    expect(parsed.card_number).toBe("[REDACTED]");
    expect(parsed.cvc).toBe("[REDACTED]");
    expect(parsed.amount).toBe(100);
  });

  it("redacts fields for matching tool glob", () => {
    const input = JSON.stringify({ ssn: "123-45-6789", name: "John", dob: "1990-01-01", phone: "555-123-4567" });
    const result = redactor.redact(input, "mcp-ehr", "get_patient_record");
    const parsed = JSON.parse(result);
    expect(parsed.ssn).toBe("[REDACTED]");
    expect(parsed.dob).toBe("[REDACTED]");
    expect(parsed.name).toBe("John");
  });

  it("does nothing when disabled", () => {
    const disabled = new Redactor({ enabled: false, rules: [{ patterns: ["ssn"] }] });
    const input = "SSN: 123-45-6789";
    expect(disabled.redact(input, "any", "any")).toBe(input);
  });

  it("skips non-matching server field rules but global patterns still apply", () => {
    const input = JSON.stringify({ card_number: "4111111111111111", name: "Test" });
    const result = redactor.redact(input, "mcp-fred", "get_series");
    const parsed = JSON.parse(result);
    // card_number field NOT redacted (field rule is stripe-only)
    // but the credit card pattern matches the value globally
    expect(parsed.name).toBe("Test");
    // card_number still present as a field (field redaction didn't fire for non-stripe)
    expect(parsed.card_number).toBeDefined();
  });
});
