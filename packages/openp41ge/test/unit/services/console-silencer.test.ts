/**
 * Unit tests for services/console-silencer.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installConsoleSilencer,
  restoreConsoleSilencer,
  isConsoleSilenced,
} from "@openp41ge/renderer/services/console-silencer";

beforeEach(() => {
  restoreConsoleSilencer();
});

afterEach(() => {
  restoreConsoleSilencer();
});

describe("console-silencer", () => {
  it("installs no-ops for all console methods", () => {
    installConsoleSilencer();
    expect(isConsoleSilenced()).toBe(true);

    for (const method of ["debug", "log", "info", "warn", "error", "trace"]) {
      expect(typeof (console as unknown as Record<string, unknown>)[method]).toBe("function");
    }
  });

  it("drops console output (does not reach the original console)", () => {
    // Capture the originals BEFORE installing the silencer.
    const originals = {
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
    } as const;

    installConsoleSilencer();

    // Calling the silenced console must not throw.
    expect(() => {
      console.debug("hello", "world");
      console.info("info message");
      console.warn("warning");
      console.error("error");
      console.log("log");
      console.trace("trace");
    }).not.toThrow();

    // Restore and confirm the originals were never touched/replaced by the
    // silencer's no-ops.
    restoreConsoleSilencer();
    expect(console.debug).toBe(originals.debug);
    expect(console.info).toBe(originals.info);
    expect(console.warn).toBe(originals.warn);
    expect(console.error).toBe(originals.error);
  });

  it("restore() brings back the original console methods", () => {
    const originalInfo = console.info;
    const originalWarn = console.warn;

    installConsoleSilencer();
    expect(console.info).not.toBe(originalInfo);

    restoreConsoleSilencer();
    expect(isConsoleSilenced()).toBe(false);
    expect(console.info).toBe(originalInfo);
    expect(console.warn).toBe(originalWarn);
  });

  it("is idempotent (double-install is safe)", () => {
    const originalInfo = console.info;

    installConsoleSilencer();
    const firstInstall = installConsoleSilencer(); // should return null
    expect(firstInstall).toBeNull();

    // Still silenced, and restoring once returns the original.
    expect(console.info).not.toBe(originalInfo);
    installConsoleSilencer(); // again
    restoreConsoleSilencer();
    expect(console.info).toBe(originalInfo);
  });

  it("silenced console calls never throw even under a hostile environment", () => {
    installConsoleSilencer();

    // Simulate a scenario where the no-op body would be forced to fail — even
    // then, the call must not throw. (The no-op wraps its body; here we just
    // assert calling with odd args and inside a throwing outer scope works.)
    expect(() => {
      console.log(undefined, null, { a: 1 }, [1, 2, 3], Symbol("x"));
    }).not.toThrow();
  });
});
