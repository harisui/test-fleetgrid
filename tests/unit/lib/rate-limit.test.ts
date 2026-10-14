// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS, SlidingWindowLimiter } from "@/lib/rate-limit";

describe("SlidingWindowLimiter", () => {
  it("allows the limit, refuses the next, and counts keys apart", () => {
    const limiter = new SlidingWindowLimiter(5, HOUR_MS);
    const start = 1_000_000;
    for (let i = 0; i < 5; i += 1) expect(limiter.take("1.1.1.1", start + i)).toBe(true);
    expect(limiter.take("1.1.1.1", start + 5)).toBe(false);
    expect(limiter.remaining("1.1.1.1", start + 5)).toBe(0);
    expect(limiter.take("2.2.2.2", start + 5)).toBe(true);
    expect(limiter.remaining("2.2.2.2", start + 5)).toBe(4);
  });

  it("slides: a hit older than the window no longer counts", () => {
    const limiter = new SlidingWindowLimiter(2, HOUR_MS);
    expect(limiter.take("k", 0)).toBe(true);
    expect(limiter.take("k", 10)).toBe(true);
    expect(limiter.take("k", 20)).toBe(false);
    expect(limiter.take("k", HOUR_MS + 1)).toBe(true);
    expect(limiter.take("k", HOUR_MS + 2)).toBe(false);
    expect(limiter.take("k", HOUR_MS + 11)).toBe(true);
  });

  it("a refused hit is not counted", () => {
    const limiter = new SlidingWindowLimiter(1, DAY_MS);
    expect(limiter.take("k", 0)).toBe(true);
    expect(limiter.take("k", 1)).toBe(false);
    expect(limiter.take("k", 2)).toBe(false);
    expect(limiter.take("k", DAY_MS + 1)).toBe(true);
  });

  it("forgets expired keys once it holds many", () => {
    const limiter = new SlidingWindowLimiter(1, 100);
    for (let i = 0; i < 1200; i += 1) limiter.take(`key-${i}`, 0);
    limiter.take("late", 1_000);
    expect(limiter.remaining("key-1", 1_000)).toBe(1);
    expect(limiter.remaining("late", 1_000)).toBe(0);
  });
});
