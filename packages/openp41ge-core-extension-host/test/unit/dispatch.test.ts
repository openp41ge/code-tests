/**
 * Unit tests for the Phase 3 dispatch bus on the host side: renderer-driven
 * (`0.2`) backends self-register via `registerProcesses`, their commands are
 * namespaced under the extension id, and handlers receive a publish context
 * for backend → renderer pushes.
 */
import { describe, it, expect, vi } from "vitest";
import { ExtensionHost } from "@openp41ge-core-extension-host/host";
import { registerProcesses } from "openp41ge-sdk";
import { createNoopLogger } from "openp41ge-core-logger";
import type { DiscoveredExtension } from "@openp41ge-core-extension-host/discovery";

const discoveredFor = (id: string): DiscoveredExtension => ({
  manifest: {
    name: `n-${id}`,
    version: "2.0.0",
    openp41ge: {
      extension: true,
      id,
      publisher: "openp41ge",
      entry: "./index.js",
      renderer: "./renderer.js",
      api: "0.2",
    },
  },
  root: `/ext/${id}`,
  entryPath: `/ext/${id}`,
});

function hostWith(
  loadEntry: () => Promise<unknown>,
  onPublish?: (topic: string, payload?: unknown) => void,
): ExtensionHost {
  return new ExtensionHost({
    discoveryDirs: [],
    createLogger: createNoopLogger,
    loadEntry,
    discover: async () => [discoveredFor("demo")],
    onPublish,
  });
}

describe("ExtensionHost renderer-driven backend (dispatch bus)", () => {
  it("captures registerProcesses handlers namespaced under the extension id", async () => {
    const host = hostWith(async () => {
      registerProcesses({
        "read-dir": async () => ({ ok: true, entries: ["a"] }),
        "open-file": async () => ({ ok: true }),
      });
      return {};
    });

    const loaded = await host.load(discoveredFor("demo"));

    expect(loaded.active).toBe(true);
    expect(host.hasHandler("demo/read-dir")).toBe(true);
    expect(host.hasHandler("demo/open-file")).toBe(true);
    // Commands are namespaced — the short key is not directly registered.
    expect(host.hasHandler("read-dir")).toBe(false);
  });

  it("dispatches request/response to the namespaced handler", async () => {
    const host = hostWith(async () => {
      registerProcesses({
        "read-dir": async (payload) => {
          expect(payload.path).toBe("/root");
          return { ok: true, entries: ["x"] };
        },
      });
      return {};
    });

    await host.load(discoveredFor("demo"));
    const result = await host.dispatch("demo/read-dir", { path: "/root" });
    expect(result).toEqual({ ok: true, entries: ["x"] });
  });

  it("passes a publish context so a handler can push to its own topics", async () => {
    const publishes: Array<{ topic: string; payload: unknown }> = [];
    const host = hostWith(
      async () => {
        registerProcesses({
          run: async (_payload, ctx) => {
            ctx?.publish("changed", { value: 7 });
            return "done";
          },
        });
        return {};
      },
      (topic, payload) => publishes.push({ topic, payload }),
    );

    await host.load(discoveredFor("demo"));
    await host.dispatch("demo/run", {});
    // The published topic is qualified with the extension id.
    expect(publishes).toEqual([{ topic: "demo/changed", payload: { value: 7 } }]);
  });

  it("isolates unknown commands with a thrown error", async () => {
    const host = hostWith(async () => {
      registerProcesses({ "read-dir": async () => "ok" });
      return {};
    });

    await host.load(discoveredFor("demo"));
    await expect(host.dispatch("demo/nope", {})).rejects.toThrow(/No extension handler registered/);
  });

  it("marks the extension inactive when the backend entry throws", async () => {
    const host = hostWith(async () => {
      throw new Error("boom");
    });

    const loaded = await host.load(discoveredFor("demo"));
    expect(loaded.active).toBe(false);
    expect(loaded.error).toContain("boom");
    expect(host.hasHandler("demo/read-dir")).toBe(false);
  });
});

describe("ExtensionHost dispatch — git for the calling workspace", () => {
  it("gives a handler the caller's git runner, and a refusing one without a caller", async () => {
    const results: unknown[] = [];
    const host = hostWith(async () => {
      registerProcesses({
        log: async (_payload, ctx) => {
          results.push(await ctx?.git({ repo: "github.com/acme/app", args: ["log"] }));
          return null;
        },
      });
      return {};
    });
    await host.load(discoveredFor("demo"));
    const git = vi.fn(async () => ({ ok: true, exitCode: 0, stdout: "abc", stderr: "" }));
    await host.dispatch("demo/log", {}, { git });
    await host.dispatch("demo/log", {});
    expect(git).toHaveBeenCalledWith({ repo: "github.com/acme/app", args: ["log"] });
    expect(results[0]).toEqual({ ok: true, exitCode: 0, stdout: "abc", stderr: "" });
    expect(results[1]).toMatchObject({ ok: false, error: expect.stringMatching(/workspace/) });
  });
});
