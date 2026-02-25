import { describe, it, expect } from "vitest";
import { Authenticator } from "../auth.js";
import jwt from "jsonwebtoken";

const SECRET = "test-secret-key-for-jwt-testing";

describe("JWT Auth", () => {
  const auth = new Authenticator({
    type: "jwt",
    jwt: {
      secret: SECRET,
      issuer: "test-issuer",
      rolesField: "roles",
      consumerIdField: "sub",
    },
  });

  it("authenticates valid JWT", () => {
    const token = jwt.sign(
      { sub: "user-123", roles: ["reader", "writer"], email: "test@example.com" },
      SECRET,
      { issuer: "test-issuer" },
    );
    const ctx = auth.authenticate(token);
    expect(ctx).not.toBeNull();
    expect(ctx!.consumerId).toBe("user-123");
    expect(ctx!.roles).toEqual(["reader", "writer"]);
    expect(ctx!.email).toBe("test@example.com");
  });

  it("rejects expired JWT", () => {
    const token = jwt.sign(
      { sub: "user-123", roles: ["reader"] },
      SECRET,
      { issuer: "test-issuer", expiresIn: "-1h" },
    );
    const ctx = auth.authenticate(token);
    expect(ctx).toBeNull();
  });

  it("rejects wrong issuer", () => {
    const token = jwt.sign(
      { sub: "user-123", roles: ["reader"] },
      SECRET,
      { issuer: "wrong-issuer" },
    );
    const ctx = auth.authenticate(token);
    expect(ctx).toBeNull();
  });

  it("rejects wrong secret", () => {
    const token = jwt.sign(
      { sub: "user-123", roles: ["reader"] },
      "wrong-secret",
      { issuer: "test-issuer" },
    );
    const ctx = auth.authenticate(token);
    expect(ctx).toBeNull();
  });

  it("handles custom roles field", () => {
    const auth2 = new Authenticator({
      type: "jwt",
      jwt: { secret: SECRET, rolesField: "permissions" },
    });
    const token = jwt.sign({ sub: "u1", permissions: ["admin"] }, SECRET);
    const ctx = auth2.authenticate(token);
    expect(ctx).not.toBeNull();
    expect(ctx!.roles).toEqual(["admin"]);
  });
});
