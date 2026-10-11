/**
 * Unit tests for console-transport.ts — the bus → console replay, including
 * the enable/disable toggle.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLogger } from "@openp41ge-core-logger/logger";
import {
  LogLevel,
  getLogBuffer,
  clearLogBuffer,
  setMinLevel,
} from "@openp41ge-core-logger/log-buffer";
import {
  setConsoleTransportEnabled,
  isConsoleTransportEnabled,
} from "@openp41ge-core-logger/console-transport";

beforeEach(() => {
  clearLogBuffer();
  setMinLevel(LogLevel.DEBUG); // capture everything for these tests
  setConsoleTransportEnabled(true);
  vi.restoreAllMocks();
});

afterEach(() => {
  setConsoleTransportEnabled(true);
  vi.restoreAllMocks();
});

describe("setConsoleTransportEnabled", () => {
  it("defaults to enabled", () => {
    expect(isConsoleTransportEnabled()).toBe(true);
  });

  it("replays to console when enabled", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("test", "enabled");
    log.info("hello");

    expect(spy).toHaveBeenCalledWith("[enabled]", "hello");
    expect(getLogBuffer()).toHaveLength(1);
  });

  it("does NOT replay to console when disabled, but still writes to the bus", () => {
    setConsoleTransportEnabled(false);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("test", "disabled");
    log.info("hello");

    expect(spy).not.toHaveBeenCalled();
    // The log bus still captured the entry — logs still reach the log system.
    expect(getLogBuffer()).toHaveLength(1);
    expect(getLogBuffer()[0].text).toBe("hello");
  });

  it("suppresses every level when disabled", () => {
    setConsoleTransportEnabled(false);
    const spies = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
    const log = createLogger("test", "levels");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
    expect(getLogBuffer()).toHaveLength(4);
  });

  it("can be re-enabled after being disabled", () => {
    setConsoleTransportEnabled(false);
    setConsoleTransportEnabled(true);

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger("test", "re-enabled");
    log.warn("back");

    expect(spy).toHaveBeenCalledWith("[re-enabled]", "back");
  });

  it("disabling after install (the common case) still works because the flag is read at emit time", () => {
    // The transport is installed at import time; the flag is read lazily per
    // entry, so toggling later suppresses subsequent output.
    setConsoleTransportEnabled(false);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("test", "late-disable");
    log.error("boom");

    expect(spy).not.toHaveBeenCalled();
    expect(getLogBuffer()).toHaveLength(1);
  });
});
