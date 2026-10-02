// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  APP_ERROR_CODES,
  AppError,
  fail,
  INTERNAL_MESSAGE,
  ok,
  parseInput,
  runAction,
  toResult,
} from "@/server/errors/AppError";

describe("AppError", () => {
  it("carries a typed code, message, field errors and cause", () => {
    const cause = new Error("db exploded");
    const error = new AppError("CONFLICT", "Already exists", {
      fieldErrors: { phone: "Taken" },
      cause,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Already exists");
    expect(error.fieldErrors).toEqual({ phone: "Taken" });
    expect(error.cause).toBe(cause);
  });

  it("has a factory for every code", () => {
    const errors = [
      AppError.notFound(),
      AppError.forbidden(),
      AppError.validation(),
      AppError.conflict(),
      AppError.rateLimited(),
      AppError.internal(),
    ];
    expect(errors.map((error) => error.code)).toEqual([...APP_ERROR_CODES]);
    for (const error of errors) expect(error.message.length).toBeGreaterThan(0);
  });

  it("factories accept custom messages", () => {
    expect(AppError.notFound("No card").message).toBe("No card");
    expect(AppError.forbidden("Nope").message).toBe("Nope");
    expect(AppError.conflict("Dup").message).toBe("Dup");
    expect(AppError.rateLimited("Slow down").message).toBe("Slow down");
    expect(AppError.validation("Bad", { zip: "5 digits" }).fieldErrors).toEqual({
      zip: "5 digits",
    });
  });

  it("internal() hides the cause behind a generic message", () => {
    const error = AppError.internal(new Error('relation "drivers" does not exist'));
    expect(error.message).toBe(INTERNAL_MESSAGE);
    expect(error.message).not.toContain("drivers");
  });

  it("fromZod maps issues to one message per field", () => {
    const schema = z.object({
      zip: z.string().min(5, "Too short").regex(/^\d+$/, "Digits only"),
      address: z.object({ state: z.string({ error: "Select your state" }) }),
    });
    const parsed = schema.safeParse({ zip: "ab", address: {} });
    if (parsed.success) throw new Error("expected failure");

    const error = AppError.fromZod(parsed.error);
    expect(error.code).toBe("VALIDATION");
    expect(error.fieldErrors).toEqual({
      zip: "Too short",
      "address.state": "Select your state",
    });
  });

  it("fromZod uses the key 'form' for root-level issues", () => {
    const parsed = z.string({ error: "Must be text" }).safeParse(5);
    if (parsed.success) throw new Error("expected failure");
    expect(AppError.fromZod(parsed.error).fieldErrors).toEqual({ form: "Must be text" });
  });
});

describe("Result helpers", () => {
  it("ok wraps data", () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });

  it("fail exposes code and message, and field errors only when present", () => {
    expect(fail(AppError.notFound("Missing"))).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Missing" },
    });
    expect(fail(AppError.validation("Bad", { zip: "5 digits" }))).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "Bad", fieldErrors: { zip: "5 digits" } },
    });
  });

  it("toResult passes AppErrors through without logging", () => {
    const log = vi.fn();
    expect(toResult(AppError.forbidden("No"), log)).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "No" },
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("toResult never leaks unknown errors and logs them", () => {
    const log = vi.fn();
    const raw = new Error('duplicate key value violates unique constraint "profiles_pkey"');
    const result = toResult(raw, log);
    expect(result).toEqual({ ok: false, error: { code: "INTERNAL", message: INTERNAL_MESSAGE } });
    expect(JSON.stringify(result)).not.toContain("profiles_pkey");
    expect(log).toHaveBeenCalledWith(raw);
  });

  it("toResult logs the cause of INTERNAL AppErrors", () => {
    const log = vi.fn();
    const cause = new Error("timeout");
    toResult(AppError.internal(cause), log);
    expect(log).toHaveBeenCalledWith(cause);

    const bare = AppError.internal();
    toResult(bare, log);
    expect(log).toHaveBeenLastCalledWith(bare);
  });

  it("toResult handles thrown non-errors", () => {
    const log = vi.fn();
    expect(toResult("boom", log)).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: INTERNAL_MESSAGE },
    });
  });

  it("toResult has a default logger", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    toResult(new Error("x"));
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("runAction", () => {
  it("returns ok with the value", async () => {
    await expect(runAction(async () => 42)).resolves.toEqual({ ok: true, data: 42 });
  });

  it("converts AppErrors to a failed Result", async () => {
    const result = await runAction(async () => {
      throw AppError.conflict("Dup");
    });
    expect(result).toEqual({ ok: false, error: { code: "CONFLICT", message: "Dup" } });
  });

  it("converts unknown errors to INTERNAL", async () => {
    const log = vi.fn();
    const result = await runAction(async () => {
      throw new Error("raw");
    }, log);
    expect(result).toEqual({ ok: false, error: { code: "INTERNAL", message: INTERNAL_MESSAGE } });
    expect(log).toHaveBeenCalledOnce();
  });

  it.each(["NEXT_REDIRECT;replace;/driver;307;", "NEXT_HTTP_ERROR_FALLBACK;404"])(
    "rethrows Next.js control flow errors (%s)",
    async (digest) => {
      const control = Object.assign(new Error("control"), { digest });
      await expect(
        runAction(async () => {
          throw control;
        }),
      ).rejects.toBe(control);
    },
  );

  it("does not treat other digests or values as control flow", async () => {
    const log = vi.fn();
    for (const thrown of [
      Object.assign(new Error("x"), { digest: 123 }),
      { digest: "OTHER" },
      null,
    ]) {
      const result = await runAction(async () => {
        throw thrown;
      }, log);
      expect(result.ok).toBe(false);
    }
  });
});

describe("parseInput", () => {
  const schema = z.object({ name: z.string({ error: "Enter your name" }).min(2, "Too short") });

  it("returns parsed data for valid input", () => {
    expect(parseInput(schema, { name: "Pat", extra: 1 })).toEqual({ name: "Pat" });
  });

  it("throws a VALIDATION AppError with field messages", () => {
    try {
      parseInput(schema, { name: "P" });
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION");
      expect((error as AppError).fieldErrors).toEqual({ name: "Too short" });
    }
  });

  it.each([undefined, null, "text", 42, true])(
    "treats non-object input %j as an empty form, never leaking parser messages",
    (input) => {
      try {
        parseInput(schema, input);
        throw new Error("expected a throw");
      } catch (error) {
        expect((error as AppError).fieldErrors).toEqual({ name: "Enter your name" });
      }
    },
  );
});
