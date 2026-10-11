/**
 * Tests for ExtensionConfigService — extension config over `config.json`:
 * each extension's registered schema, the user's values stored under
 * `extensions.<id>`, the merged values both sides read, and change
 * notification.
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import type { ConfigSchema } from "openp41ge-sdk";
import { ConfigService } from "@openp41ge/main/services/config-service";
import { ExtensionConfigService } from "@openp41ge/main/services/extension-config-service";

const SCHEMA: ConfigSchema = {
  type: "object",
  properties: {
    model: { type: "string", default: "qwen" },
    temperature: { type: "number", minimum: 0, maximum: 2, default: 0.7 },
    endpoint: {
      type: "object",
      properties: { baseUrl: { type: "string", default: "http://localhost:8000" } },
    },
  },
};

let tmpDir: string;
let config: ConfigService;
let store: ExtensionConfigService;

const configFile = () =>
  JSON.parse(fs.readFileSync(path.join(tmpDir, ".config", "config.json"), "utf-8"));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-ext-config-test-"));
  config = new ConfigService(tmpDir);
  config.init();
  store = new ExtensionConfigService(config);
});

afterEach(() => {
  config.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ExtensionConfigService", () => {
  test("an extension without a schema has an empty config", () => {
    expect(store.get("demo")).toEqual({});
    expect(store.describe("demo")).toBeNull();
  });

  test("the merged config is the schema's defaults until the user sets values", () => {
    store.registerSchema("demo", SCHEMA);
    expect(store.get("demo")).toEqual({
      model: "qwen",
      temperature: 0.7,
      endpoint: { baseUrl: "http://localhost:8000" },
    });
  });

  test("stores only the user's values, under extensions.<id>, and merges them", () => {
    store.registerSchema("demo", SCHEMA);
    store.setOverrides("demo", { model: "llama", endpoint: { baseUrl: "http://gpu:8000" } });

    expect(configFile()).toEqual({
      extensions: { demo: { model: "llama", endpoint: { baseUrl: "http://gpu:8000" } } },
    });
    expect(store.get("demo")).toEqual({
      model: "llama",
      temperature: 0.7,
      endpoint: { baseUrl: "http://gpu:8000" },
    });
    expect(store.describe("demo")).toEqual({
      schema: SCHEMA,
      defaults: { model: "qwen", temperature: 0.7, endpoint: { baseUrl: "http://localhost:8000" } },
      overrides: { model: "llama", endpoint: { baseUrl: "http://gpu:8000" } },
    });
  });

  test("replaces the stored values (a removed key goes back to its default)", () => {
    store.registerSchema("demo", SCHEMA);
    store.setOverrides("demo", { model: "llama", temperature: 1 });
    store.setOverrides("demo", { temperature: 1 });
    expect(store.get("demo").model).toBe("qwen");
    expect(configFile()).toEqual({ extensions: { demo: { temperature: 1 } } });
  });

  test("refuses values that do not match the schema, storing nothing", () => {
    store.registerSchema("demo", SCHEMA);
    expect(() => store.setOverrides("demo", { temperature: 5 })).toThrow(
      /temperature: must be at most 2/,
    );
    expect(configFile()).toEqual({});
  });

  test("refuses values for an extension without a schema", () => {
    expect(() => store.setOverrides("demo", { model: "x" })).toThrow(/no config schema/);
  });

  test("refuses an invalid schema", () => {
    expect(() => store.registerSchema("demo", { type: "string" } as ConfigSchema)).toThrow(
      /root must be an object/,
    );
  });

  test("reads values already in config.json when the schema registers", () => {
    config.set("extensions", { demo: { model: "mistral" } });
    store.registerSchema("demo", SCHEMA);
    expect(store.get("demo").model).toBe("mistral");
  });

  test("notifies each change of an extension's merged config, however it was made", () => {
    store.registerSchema("demo", SCHEMA);
    store.registerSchema("other", { type: "object", properties: {} });
    const changes: Array<[string, unknown]> = [];
    const off = store.onChange((id, merged) => changes.push([id, merged.model]));

    store.setOverrides("demo", { model: "llama" });
    // A write to an unrelated key (or the same value again) is not a change.
    config.set("appTheme", "light");
    store.setOverrides("demo", { model: "llama" });
    // A write straight to config.json's section (e.g. the file edited by hand).
    config.set("extensions.demo.model", "mistral");

    expect(changes).toEqual([
      ["demo", "llama"],
      ["demo", "mistral"],
    ]);
    off();
    store.setOverrides("demo", {});
    expect(changes).toHaveLength(2);
  });

  test("a newer schema replaces the previous one and reports the change", () => {
    store.registerSchema("demo", SCHEMA);
    const changes: string[] = [];
    store.onChange((id) => changes.push(id));
    store.registerSchema("demo", SCHEMA);
    expect(changes).toEqual([]);
    store.registerSchema("demo", {
      type: "object",
      properties: { model: { type: "string", default: "phi" } },
    });
    expect(store.get("demo")).toEqual({ model: "phi" });
    expect(changes).toEqual(["demo"]);
  });
});
