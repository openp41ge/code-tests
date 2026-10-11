/**
 * Unit tests for the rest of a backend's context: `ctx.log` (the extension's
 * logger), `ctx.windowId` (the dispatching window), and `registerDispose`
 * (cleanups run when the extension unloads).
 */
import { describe, it, expect, vi } from "vitest";
import { ExtensionHost } from "@openp41ge-core-extension-host/host";
import { registerDispose, registerProcesses } from "openp41ge-sdk";
import { createNoopLogger, type ILogger } from "openp41ge-core-logger";
import type { DiscoveredExtension } from "@openp41ge-core-extension-host/discovery";

const discovered: DiscoveredExtension = {
  manifest: {
    name: "n-demo",
    version: "2.0.0",
    openp41ge: {
      extension: true,
      id: "demo",
      publisher: "openp41ge",
      entry: "./index.js",
      api: "0.2",
    },
  },
  root: "/ext/demo",
  entryPath: "/ext/demo",
};

function hostWith(loadEntry: () => Promise<unknown>, logger: ILogger = createNoopLogger()) {
  return new ExtensionHost({
    discoveryDirs: [],
    createLogger: () => logger,
    loadEntry,
    discover: async () => [discovered],
  });
}

describe("backend context", () => {
  it("gives the handler the extension's logger", async () => {
    const logger = { ...createNoopLogger(), info: vi.fn() } as ILogger;
    const host = hostWith(async () => {
      registerProcesses({ hello: (_p, ctx) => void ctx?.log.info("hello") });
      return {};
    }, logger);
    await host.load(discovered);
    await host.dispatch("demo/hello", {});
    expect(logger.info).toHaveBeenCalledWith("hello");
  });

  it("gives the handler the dispatching window's id, or null", async () => {
    const host = hostWith(async () => {
      registerProcesses({ win: (_p, ctx) => ({ windowId: ctx?.windowId }) });
      return {};
    });
    await host.load(discovered);
    expect(await host.dispatch("demo/win", {}, { windowId: "w2" })).toEqual({ windowId: "w2" });
    expect(await host.dispatch("demo/win", {})).toEqual({ windowId: null });
  });

  it("runs registered disposers when the extension unloads, once", async () => {
    const disposed = vi.fn();
    const host = hostWith(async () => {
      registerProcesses({});
      registerDispose(disposed);
      return {};
    });
    await host.load(discovered);
    expect(disposed).not.toHaveBeenCalled();
    await host.deactivateAll();
    expect(disposed).toHaveBeenCalledTimes(1);
    await host.deactivateAll();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it("keeps running the other disposers when one throws", async () => {
    const second = vi.fn();
    const host = hostWith(async () => {
      registerDispose(() => {
        throw new Error("boom");
      });
      registerDispose(second);
      return {};
    });
    await host.load(discovered);
    await host.deactivateAll();
    expect(second).toHaveBeenCalled();
  });
});
