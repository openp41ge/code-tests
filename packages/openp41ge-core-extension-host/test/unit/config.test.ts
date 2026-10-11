/**
 * Unit tests for extension config on the host side: a backend entry's
 * `registerConfigSchema` reaches the platform's config store, and handlers
 * read the merged values through `ctx.config.get()`.
 */
import { describe, it, expect } from "vitest";
import { ExtensionHost, type ExtensionConfigStore } from "@openp41ge-core-extension-host/host";
import { registerConfigSchema, registerProcesses, type ConfigSchema } from "openp41ge-sdk";
import { createNoopLogger } from "openp41ge-core-logger";
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

const SCHEMA: ConfigSchema = {
  type: "object",
  properties: { model: { type: "string", default: "qwen" } },
};

function hostWith(loadEntry: () => Promise<unknown>, config?: ExtensionConfigStore) {
  return new ExtensionHost({
    discoveryDirs: [],
    createLogger: createNoopLogger,
    loadEntry,
    discover: async () => [discovered],
    config,
  });
}

const entry = async () => {
  registerConfigSchema(SCHEMA);
  registerProcesses({ model: (_payload, ctx) => ({ model: ctx?.config.get().model }) });
  return {};
};

describe("ExtensionHost config", () => {
  it("hands the backend's schema to the config store and reads values from it", async () => {
    const schemas: Array<[string, ConfigSchema]> = [];
    let model = "llama";
    const host = hostWith(entry, {
      registerSchema: (id, schema) => schemas.push([id, schema]),
      get: () => ({ model }),
    });

    expect((await host.load(discovered)).active).toBe(true);
    expect(schemas).toEqual([["demo", SCHEMA]]);
    expect(await host.dispatch("demo/model", {})).toEqual({ model: "llama" });
    model = "mistral";
    expect(await host.dispatch("demo/model", {})).toEqual({ model: "mistral" });
  });

  it("gives the schema's defaults without a config store", async () => {
    const host = hostWith(entry);
    await host.load(discovered);
    expect(await host.dispatch("demo/model", {})).toEqual({ model: "qwen" });
  });

  it("fails the load when the store refuses the schema", async () => {
    const host = hostWith(entry, {
      registerSchema: () => {
        throw new Error("a different schema is registered");
      },
      get: () => ({}),
    });
    const loaded = await host.load(discovered);
    expect(loaded.active).toBe(false);
    expect(loaded.error).toMatch(/a different schema/);
  });
});
