/**
 * Unit tests for the main-process ExtensionHostManager.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ExtensionHostManager,
  EXTENSIONS_DIR_NAME,
} from "@openp41ge/main/services/extension-host-manager";
import { ExtensionHost, type ExtensionHostOptions } from "openp41ge-core-extension-host";
import type { ActiveExtensionSummary } from "openp41ge-core-extension-host";
import { createNoopLogger } from "openp41ge-core-logger";
import { registerDispose, registerProcesses, registerSearchProvider } from "openp41ge-sdk";

let installDir: string;

beforeEach(async () => {
  installDir = await mkdtemp(join(tmpdir(), "ext-manager-"));
});

afterEach(async () => {
  await rm(installDir, { recursive: true, force: true });
});

const manifestFor = (id: string) => ({
  name: `openp41ge-extension-${id}`,
  version: "1.0.0",
  openp41ge: {
    extension: true as const,
    id,
    publisher: "openp41ge",
    entry: "./dist/index.js",
    api: "0.2",
  },
});

const discoveredFor = (id: string) => ({
  manifest: manifestFor(id),
  root: `/ext/${id}`,
  entryPath: `/ext/${id}`,
});

interface Setup {
  manager: ExtensionHostManager;
  lastOpts: { discoveryDirs: string[] } | null;
  stateChanges: ActiveExtensionSummary[][];
}

/** An entry module: what it does when imported (it self-registers). */
type EntryModule = () => void;

async function setup(modules: Record<string, EntryModule> = {}, extra?: string[]): Promise<Setup> {
  const stateChanges: ActiveExtensionSummary[][] = [];
  const holder: { value?: { discoveryDirs: string[] } } = {};

  const manager = new ExtensionHostManager({
    installDir,
    createHost: (opts) => {
      holder.value = { discoveryDirs: opts.discoveryDirs };
      return new ExtensionHost({
        discoveryDirs: opts.discoveryDirs,
        createLogger: createNoopLogger,
        discover: async () => Object.keys(modules).map(discoveredFor),
        loadEntry: async (p) => {
          modules[String(p).replace("/ext/", "")]?.();
          return {};
        },
      });
    },
    extraDiscoveryDirs: extra,
    onStateChange: (active) => stateChanges.push(active),
  });

  return {
    manager,
    get lastOpts() {
      return holder.value ?? null;
    },
    stateChanges,
  };
}

describe("ExtensionHostManager", () => {
  it("boots the host against the global install dir", async () => {
    const s = await setup({ x: () => {} });
    await s.manager.init();

    expect(s.lastOpts?.discoveryDirs).toEqual([installDir]);
    expect(s.manager.activeExtensions().map((e) => e.id)).toEqual(["x"]);
  });

  it("appends extra discovery dirs (dev source extensions) to the scan roots", async () => {
    const s = await setup({}, ["/repo/packages"]);
    await s.manager.init();

    expect(s.lastOpts?.discoveryDirs).toEqual([installDir, "/repo/packages"]);
  });

  it("scans the workspace extensions dir once a workspace path is set", async () => {
    const s = await setup({});
    await s.manager.init();
    await s.manager.setWorkspacePath("/repo/my-workspace");

    expect(s.lastOpts?.discoveryDirs).toEqual([
      installDir,
      join("/repo/my-workspace", EXTENSIONS_DIR_NAME),
    ]);
  });

  it("clears the workspace scan dir when the path is reset to null", async () => {
    const s = await setup({});
    await s.manager.init();
    await s.manager.setWorkspacePath("/repo/ws");
    await s.manager.setWorkspacePath(null);
    expect(s.lastOpts?.discoveryDirs).toEqual([installDir]);
  });

  it("routes a dispatch to a registered extension handler", async () => {
    let received: unknown;
    const s = await setup({
      h: () => registerProcesses({ go: (p) => void (received = p) }),
    });
    await s.manager.init();
    expect(s.manager.hasHandler("h/go")).toBe(true);
    await s.manager.dispatch("h/go", { a: 1 });
    expect(received).toEqual({ a: 1 });
  });

  it("routes palette searches and create actions to an extension's provider", async () => {
    const s = await setup({
      h: () =>
        registerSearchProvider({
          id: "things",
          search: (q) => [{ create: "make", title: `make ${q}` }],
          create: (c, q) => ({ kind: "h/thing", params: { name: q }, title: c }),
        }),
    });
    await s.manager.init();
    expect(s.manager.searchProviders()).toEqual([{ extensionId: "h", id: "things" }]);
    expect(await s.manager.search("h", "things", "x")).toEqual({
      ok: true,
      items: [{ create: "make", title: "make x" }],
    });
    expect(await s.manager.createFromSearch("h", "things", "make", "x")).toEqual({
      ok: true,
      item: { kind: "h/thing", params: { name: "x" }, title: "make" },
    });
  });

  it("unloads the previous host's extensions when it reloads", async () => {
    let deactivated = 0;
    const s = await setup({ x: () => registerDispose(() => void deactivated++) });
    await s.manager.init();
    await s.manager.setWorkspacePath("/repo/ws");
    expect(deactivated).toBe(1);
    expect(s.manager.activeExtensions().map((e) => e.id)).toEqual(["x"]);
  });

  it("unloads every extension on shutdown", async () => {
    let deactivated = 0;
    const s = await setup({ x: () => registerDispose(() => void deactivated++) });
    await s.manager.init();
    await s.manager.shutdown();
    expect(deactivated).toBe(1);
    expect(s.manager.activeExtensions()).toEqual([]);
  });

  it("notifies on state change after load and reload", async () => {
    const s = await setup({ x: () => {} });
    await s.manager.init();
    expect(s.stateChanges.length).toBeGreaterThanOrEqual(1);
    expect(s.stateChanges[0].map((e) => e.id)).toEqual(["x"]);
  });
});
