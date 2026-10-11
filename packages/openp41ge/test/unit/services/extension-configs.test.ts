/**
 * ExtensionConfigs — the renderer's cache of each extension's merged config
 * behind `host.config`: a renderer entry's schema is sent to main, the merged
 * values are read once at load (so `get()` is synchronous), and main's change
 * broadcasts update the cache and reach every subscriber of that extension.
 */
import { describe, it, expect, vi } from "vitest";
import type { ConfigSchema } from "openp41ge-sdk";
import {
  ExtensionConfigs,
  type ExtensionConfigBridge,
  type ExtensionConfigChange,
} from "@openp41ge/renderer/services/extension-configs";

const SCHEMA: ConfigSchema = {
  type: "object",
  properties: { model: { type: "string", default: "qwen" } },
};

function fakeBridge(values: Record<string, Record<string, unknown>> = {}) {
  let emit: (change: ExtensionConfigChange) => void = () => undefined;
  const bridge: ExtensionConfigBridge = {
    registerSchema: vi.fn(async () => undefined),
    get: vi.fn(async (id: string) => values[id] ?? {}),
    describe: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    onChanged: (fn) => {
      emit = fn;
      return () => undefined;
    },
  };
  return { bridge, emit: (change: ExtensionConfigChange) => emit(change) };
}

describe("ExtensionConfigs", () => {
  it("sends a renderer entry's schema to main, then caches the merged values", async () => {
    const { bridge } = fakeBridge({ demo: { model: "llama" } });
    const configs = new ExtensionConfigs(bridge);
    await configs.load("demo", SCHEMA);
    expect(bridge.registerSchema).toHaveBeenCalledWith("demo", SCHEMA);
    expect(configs.hostFor("demo", () => undefined).get()).toEqual({ model: "llama" });
  });

  it("reads the values of an extension whose schema came from its backend", async () => {
    const { bridge } = fakeBridge({ demo: { model: "qwen" } });
    const configs = new ExtensionConfigs(bridge);
    await configs.load("demo", null);
    expect(bridge.registerSchema).not.toHaveBeenCalled();
    expect(configs.hostFor("demo", () => undefined).get()).toEqual({ model: "qwen" });
  });

  it("updates the cache and notifies that extension's subscribers on a change", async () => {
    const { bridge, emit } = fakeBridge();
    const configs = new ExtensionConfigs(bridge);
    await configs.load("demo", SCHEMA);
    const host = configs.hostFor("demo", () => undefined);
    const seen: unknown[] = [];
    const off = host.subscribe((c) => seen.push(c));

    emit({ extensionId: "other", config: { x: 1 } });
    emit({ extensionId: "demo", config: { model: "mistral" } });
    expect(seen).toEqual([{ model: "mistral" }]);
    expect(host.get()).toEqual({ model: "mistral" });

    off();
    emit({ extensionId: "demo", config: { model: "phi" } });
    expect(seen).toHaveLength(1);
  });

  it("opens the editor through the given action", () => {
    const configs = new ExtensionConfigs(fakeBridge().bridge);
    const openEditor = vi.fn();
    configs.hostFor("demo", openEditor).openEditor();
    expect(openEditor).toHaveBeenCalled();
  });

  it("keeps an empty config when main refuses the schema", async () => {
    const { bridge } = fakeBridge({ demo: { model: "llama" } });
    bridge.registerSchema = vi.fn(async () => {
      throw new Error("bad schema");
    });
    const configs = new ExtensionConfigs(bridge);
    await expect(configs.load("demo", SCHEMA)).rejects.toThrow(/bad schema/);
    expect(configs.hostFor("demo", () => undefined).get()).toEqual({});
  });
});
