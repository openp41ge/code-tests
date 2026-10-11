/**
 * The backend entry through the extension host: it registers the config
 * schema (the host hands it to the config store), the commands under the
 * extension's id, and a cleanup that runs on unload.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { ExtensionHost } from "openp41ge-core-extension-host";
import { configDefaults, type CallerWorkspace, type ConfigSchema } from "openp41ge-sdk";

const ID = "openp41ge-extension-agents";
const discovered = {
  manifest: {
    name: ID,
    version: "0.1.0",
    openp41ge: { extension: true as const, id: ID, publisher: "openp41ge", entry: "x", api: "0.2" },
  },
  root: "/ext",
  entryPath: "/ext/index.js",
};

describe("backend entry", () => {
  it("registers its config, commands and cleanup with the host", async () => {
    const schemas: ConfigSchema[] = [];
    const host = new ExtensionHost({
      discoveryDirs: [],
      createLogger: () => {
        const noop = () => undefined;
        return { debug: noop, info: noop, warn: noop, error: noop } as never;
      },
      loadEntry: () => import("@openp41ge-extension-agents/index"),
      discover: async () => [discovered],
      config: {
        registerSchema: (_id, schema) => void schemas.push(schema),
        get: () => configDefaults(schemas[0]),
      },
    });
    const loaded = await host.load(discovered);
    expect(loaded.error).toBeUndefined();
    expect(configDefaults(schemas[0])).toMatchObject({ providerId: "vllm" });

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-entry-"));
    try {
      const workspace: CallerWorkspace = {
        id: "ws1",
        roots: async () => [],
        dataDirFor: async (id) => path.join(dataDir, "extensions", id),
      };
      const chat = (await host.dispatch(`${ID}/create`, { title: "T" }, { workspace })) as {
        id: string;
        providerId: string;
      };
      expect(chat.providerId).toBe("vllm");
      await host.deactivateAll();
      expect(fs.readdirSync(path.join(dataDir, "extensions", ID, "chat-threads"))).toContain(
        chat.id,
      );
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
