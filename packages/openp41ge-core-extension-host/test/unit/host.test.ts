/**
 * Unit tests for the ExtensionHost lifecycle: discovery order, error
 * isolation, (de)activation and dispatch for self-registering (`api: "0.2"`)
 * extensions; an extension built for another API version is not loaded.
 */
import { describe, it, expect } from "vitest";
import { ExtensionHost } from "@openp41ge-core-extension-host/host";
import type { DiscoveredExtension } from "@openp41ge-core-extension-host/discovery";
import { registerDispose, registerProcesses } from "openp41ge-sdk";
import { createNoopLogger, type ILogger } from "openp41ge-core-logger";

/** An entry module: what it does when imported (self-registration). */
type EntryModule = () => void;

const noopLogger = (): ILogger => createNoopLogger();
const okModule = (): EntryModule => () => {
  registerProcesses({ cmd: async () => {} });
  registerDispose(() => {});
};

const manifestFor = (id: string, api = "0.2") => ({
  name: `n-${id}`,
  version: "1.0.0",
  openp41ge: {
    extension: true as const,
    id,
    publisher: "openp41ge",
    entry: "./index.js",
    renderer: "./renderer.js",
    api,
  },
});

const discoveredFor = (id: string, api?: string): DiscoveredExtension => ({
  manifest: manifestFor(id, api),
  root: `/ext/${id}`,
  entryPath: `/ext/${id}`,
});

interface HostTestOpts {
  discovered?: DiscoveredExtension[];
}

function makeHost(modules: Map<string, EntryModule>, opts: HostTestOpts = {}): ExtensionHost {
  return new ExtensionHost({
    discoveryDirs: [],
    createLogger: noopLogger,
    loadEntry: async (p) => {
      const mod = modules.get(p);
      if (!mod) throw new Error(`No module for entry "${p}"`);
      mod();
      return {};
    },
    discover: async () => opts.discovered ?? [],
  });
}

describe("ExtensionHost", () => {
  it("activates an extension and collects its handlers", async () => {
    const host = makeHost(new Map([["/ext/one", okModule()]]));
    const loaded = await host.load(discoveredFor("one"));

    expect(loaded.active).toBe(true);
    expect(loaded.handlers.has("one/cmd")).toBe(true);
    expect(host.hasHandler("one/cmd")).toBe(true);
    expect(host.activeExtensions()).toEqual([
      { id: "one", version: "1.0.0", renderer: "./renderer.js" },
    ]);
  });

  it("does not load an extension built for another API version, and says why", async () => {
    let imported = false;
    const host = makeHost(new Map([["/ext/old", () => void (imported = true)]]));
    const loaded = await host.load(discoveredFor("old", "0.1"));

    expect(loaded.active).toBe(false);
    expect(loaded.error).toMatch(/API "0\.1".*"0\.2"/);
    expect(imported).toBe(false);
    expect(host.activeExtensions()).toEqual([]);
  });

  it("dispatches to a registered handler", async () => {
    let received: unknown;
    const host = makeHost(
      new Map([["/ext/h", () => registerProcesses({ go: (p) => void (received = p) })]]),
    );
    await host.load(discoveredFor("h"));

    await host.dispatch("h/go", { a: 1 });
    expect(received).toEqual({ a: 1 });
  });

  it("throws on dispatch to an unregistered command", async () => {
    const host = makeHost(new Map());
    await expect(host.dispatch("nope", {})).rejects.toThrow(/No extension handler/);
  });

  it("isolates a failing extension (does not break the host)", async () => {
    const host = makeHost(
      new Map([
        [
          "/ext/bad",
          () => {
            throw new Error("boom");
          },
        ],
        ["/ext/good", okModule()],
      ]),
      { discovered: [discoveredFor("bad"), discoveredFor("good")] },
    );
    const results = await host.loadAll();
    const bad = results.find((r) => r.id === "bad")!;
    const good = results.find((r) => r.id === "good")!;

    expect(bad.active).toBe(false);
    expect(bad.error).toContain("boom");
    expect(good.active).toBe(true);
    expect(host.activeExtensions().map((e) => e.id)).toEqual(["good"]);
  });

  it("does not register handlers on failure", async () => {
    const host = makeHost(
      new Map([
        [
          "/ext/bad",
          () => {
            registerProcesses({ cmd: async () => {} });
            throw new Error("x");
          },
        ],
      ]),
    );
    await host.load(discoveredFor("bad"));
    expect(host.hasHandler("bad/cmd")).toBe(false);
    expect(host.activeExtensions()).toEqual([]);
  });

  it("deactivates an extension: removes its handlers and runs its disposers", async () => {
    let disposed = false;
    const host = makeHost(
      new Map([
        [
          "/ext/d",
          () => {
            registerProcesses({ go: async () => {} });
            registerDispose(() => void (disposed = true));
          },
        ],
      ]),
    );
    await host.load(discoveredFor("d"));

    await host.deactivate("d");
    expect(disposed).toBe(true);
    expect(host.hasHandler("d/go")).toBe(false);
    expect(host.activeExtensions()).toEqual([]);
  });

  it("loadAll activates every discovered extension in order", async () => {
    const host = makeHost(
      new Map([
        ["/ext/one", okModule()],
        ["/ext/two", okModule()],
      ]),
      { discovered: [discoveredFor("one"), discoveredFor("two")] },
    );
    const results = await host.loadAll();
    expect(results.map((r) => r.id)).toEqual(["one", "two"]);
    expect(host.activeExtensions().map((e) => e.id)).toEqual(["one", "two"]);
  });

  it("does not re-activate an already-active extension", async () => {
    let activations = 0;
    const host = makeHost(new Map([["/ext/one", () => void activations++]]));
    await host.load(discoveredFor("one"));
    await host.load(discoveredFor("one"));
    expect(activations).toBe(1);
  });

  it("loads every discovered extension (no load order between them is guaranteed)", async () => {
    const host = makeHost(
      new Map([
        ["/ext/alpha", okModule()],
        ["/ext/beta", okModule()],
        ["/ext/gamma", okModule()],
      ]),
      {
        discovered: [discoveredFor("alpha"), discoveredFor("beta"), discoveredFor("gamma")],
      },
    );
    const results = await host.loadAll();
    expect(results.map((r) => r.id).sort()).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("default entry loader cache-busts on host reload", () => {
  const selfRegFixture = new URL("./fixtures/self-register.mjs", import.meta.url).pathname;

  it("re-executes a renderer-driven entry for a fresh host so handlers are not lost", async () => {
    const discovered: DiscoveredExtension = {
      manifest: {
        name: "n-self",
        version: "1.0.0",
        openp41ge: {
          extension: true as const,
          id: "self",
          publisher: "openp41ge",
          entry: "./index.js",
          api: "0.2" as const,
        },
      },
      root: "/ext/self",
      entryPath: selfRegFixture,
    };
    const make = () =>
      new ExtensionHost({
        discoveryDirs: [],
        createLogger: noopLogger,
        discover: async () => [],
      });

    // First host: entry self-registers at import time.
    const host1 = make();
    await host1.load(discovered);
    expect(host1.hasHandler("self/ping")).toBe(true);

    // Second host in the SAME process: the entry module is already cached, so
    // without cache-busting the re-import would return the cached module and
    // never re-run `registerProcesses`, leaving this host with no handlers.
    const host2 = make();
    await host2.load(discovered);
    expect(host2.hasHandler("self/ping")).toBe(true);
  });
});
