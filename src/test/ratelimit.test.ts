import { describe, it, expect } from "vitest";
import { RateLimiter } from "../ratelimit.js";

describe("RateLimiter", () => {
  it("allows requests within limit", () => {
    const rl = new RateLimiter(10, 1);
    for (let i = 0; i < 10; i++) {
      expect(rl.check("test").allowed).toBe(true);
    }
  });

  it("blocks requests over limit", () => {
    const rl = new RateLimiter(5, 1);
    for (let i = 0; i < 5; i++) rl.check("test");
    expect(rl.check("test").allowed).toBe(false);
  });

  it("tracks remaining count", () => {
    const rl = new RateLimiter(10, 1);
    const r1 = rl.check("test");
    expect(r1.remaining).toBe(9);
    const r2 = rl.check("test");
    expect(r2.remaining).toBe(8);
  });

  it("isolates different keys", () => {
    const rl = new RateLimiter(2, 1);
    rl.check("a"); rl.check("a");
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed).toBe(true);
  });

  it("respects burst multiplier", () => {
    const rl = new RateLimiter(5, 2); // burst = 10
    for (let i = 0; i < 10; i++) {
      expect(rl.check("test").allowed).toBe(true);
    }
    expect(rl.check("test").allowed).toBe(false);
  });

  it("allows override per key", () => {
    const rl = new RateLimiter(100, 1);
    for (let i = 0; i < 3; i++) rl.check("test", 3);
    expect(rl.check("test", 3).allowed).toBe(false);
  });
});
