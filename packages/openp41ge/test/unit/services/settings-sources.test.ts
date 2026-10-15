/**
 * The settings editor's sources: the reserved id `openp41ge` is the
 * platform's own global settings (a slice of config.json, described by the
 * global settings schema); every other id is that extension's config.
 */
import { describe, it, expect, vi } from "vitest";
import {
  PLATFORM_SETTINGS_ID,
  settingsBridge,
  type PlatformConfigBridge,
} from "@openp41ge/renderer/services/settings-sources";
import type { ExtensionConfigBridge } from "@openp41ge/renderer/services/extension-configs";

function platform(overrides: Record<string, unknown> = {}) {
  const listeners = new Set<() => void>();
  const bridge: PlatformConfigBridge & { set: ReturnType<typeof vi.fn> } = {
    getDefaults: async () => ({
      appTheme: "dark",
      updateChannel: "latest",
      dragConsumers: {},
      "editor/*": { lineHeight: 20, fontSize: 14 },
      "editor/file": { maxFileSize: 1000, wordWrap: false },
      "editor/json": {},
      extensions: { "some-ext": {} },
    }),
    getOverrides: async () => ({
      "editor/*": { lineHeight: 24 },
      "editor/file": { wordWrap: true },
      extensions: { "some-ext": { a: 1 } },
      ...overrides,
    }),
    set: vi.fn(async () => undefined),
    onChanged: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return { bridge, emit: () => listeners.forEach((fn) => fn()) };
}

function extension(): ExtensionConfigBridge & Record<string, ReturnType<typeof vi.fn>> {
  return {
    registerSchema: vi.fn(async () => undefined),
    get: vi.fn(async () => ({})),
    describe: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    onChanged: vi.fn(() => () => undefined),
  } as unknown as ExtensionConfigBridge & Record<string, ReturnType<typeof vi.fn>>;
}

describe("settingsBridge — the platform's settings", () => {
  it("describes the global settings: their schema, defaults and the user's values", async () => {
    const p = platform();
    const d = await settingsBridge(extension(), p.bridge).describe(PLATFORM_SETTINGS_ID);
    expect(d?.defaults).toEqual({
      appTheme: "dark",
      updateChannel: "latest",
      dragConsumers: {},
      "editor/*": { lineHeight: 20, fontSize: 14 },
      "editor/file": { maxFileSize: 1000, wordWrap: false },
      "editor/json": {},
    });
    // The platform's settings only: extensions' sections stay out.
    expect(d?.overrides).toEqual({
      "editor/*": { lineHeight: 24 },
      "editor/file": { wordWrap: true },
    });
    expect(d?.schema.properties).toHaveProperty("dragConsumers");
    for (const section of ["editor/*", "editor/file", "editor/json"]) {
      expect(d?.schema.properties).toHaveProperty([section]);
    }
    for (const retired of ["lineHeight", "editorFontSize", "editor"]) {
      expect(d?.schema.properties).not.toHaveProperty([retired]);
    }
  });

  it("saves the document: each global key written, a removed one cleared", async () => {
    const p = platform();
    await settingsBridge(extension(), p.bridge).set(PLATFORM_SETTINGS_ID, {
      appTheme: "light",
      dragConsumers: { "openp41ge/file-path": "my/viewer" },
    });
    expect(p.bridge.set).toHaveBeenCalledWith("appTheme", "light");
    expect(p.bridge.set).toHaveBeenCalledWith("dragConsumers", {
      "openp41ge/file-path": "my/viewer",
    });
    expect(p.bridge.set).toHaveBeenCalledWith("editor/*", undefined);
    expect(p.bridge.set).toHaveBeenCalledWith("editor/file", undefined);
    expect(p.bridge.set).not.toHaveBeenCalledWith("extensions", expect.anything());
  });

  it("saves the editors' settings, and refuses a wrong type or a key in the wrong section", async () => {
    const p = platform();
    const bridge = settingsBridge(extension(), p.bridge);
    await bridge.set(PLATFORM_SETTINGS_ID, {
      "editor/*": { lineHeight: 22 },
      "editor/file": { maxFileSize: 2048, wordWrap: true },
      "editor/json": { fontSize: 12 },
    });
    expect(p.bridge.set).toHaveBeenCalledWith("editor/*", { lineHeight: 22 });
    expect(p.bridge.set).toHaveBeenCalledWith("editor/file", { maxFileSize: 2048, wordWrap: true });
    expect(p.bridge.set).toHaveBeenCalledWith("editor/json", { fontSize: 12 });
    await expect(
      bridge.set(PLATFORM_SETTINGS_ID, { "editor/file": { wordWrap: "yes" } }),
    ).rejects.toThrow(/wordWrap/);
    // The JSON editors cannot wrap, and file-only settings are not shared.
    for (const doc of [
      { "editor/json": { wordWrap: true } },
      { "editor/*": { maxFileSize: 1 } },
      { "editor/*": { trimTrailingWhitespace: false } },
    ]) {
      await expect(bridge.set(PLATFORM_SETTINGS_ID, doc)).rejects.toThrow();
    }
  });

  it("refuses a value the schema does not allow, writing nothing", async () => {
    const p = platform();
    await expect(
      settingsBridge(extension(), p.bridge).set(PLATFORM_SETTINGS_ID, { appTheme: "purple" }),
    ).rejects.toThrow(/appTheme/);
    expect(p.bridge.set).not.toHaveBeenCalled();
  });

  it("reports a platform config change as a change of its id", () => {
    const p = platform();
    const seen: string[] = [];
    settingsBridge(extension(), p.bridge).onChanged((c) => seen.push(c.extensionId));
    p.emit();
    expect(seen).toEqual([PLATFORM_SETTINGS_ID]);
  });
});

describe("settingsBridge — dragConsumers offers the registered kinds", () => {
  /** Registered consumers: kind → ids (first registered first). */
  function consumers(choices: Record<string, string[]>) {
    const listeners = new Set<() => void>();
    let current = new Map(Object.entries(choices));
    return {
      source: {
        choices: () => current,
        onChange: (fn: () => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      },
      replace(next: Record<string, string[]>) {
        current = new Map(Object.entries(next));
        listeners.forEach((fn) => fn());
      },
    };
  }
  const registered = {
    "openp41ge/file-path": ["file-viewer", "my-ext/viewer"],
    "openp41ge/log-stream": ["log-viewer"],
  };
  type DragSchema = {
    properties: Record<
      string,
      { enum: string[]; default?: string; readOnly?: boolean; description?: string }
    >;
    additionalProperties: unknown;
  };
  const dragSchema = (d: { schema: unknown } | null) =>
    (d!.schema as { properties: { dragConsumers: DragSchema } }).properties.dragConsumers;

  it("has a setting per registered kind: a menu of its consumers, the first registered by default", async () => {
    const c = consumers(registered);
    const d = await settingsBridge(extension(), platform().bridge, c.source).describe(
      PLATFORM_SETTINGS_ID,
    );
    const s = dragSchema(d);
    expect(Object.keys(s.properties)).toEqual(["openp41ge/file-path", "openp41ge/log-stream"]);
    expect(s.properties["openp41ge/file-path"]).toMatchObject({
      type: "string",
      enum: ["file-viewer", "my-ext/viewer"],
      default: "file-viewer",
    });
    expect(s.additionalProperties).toBe(false);
    expect(d!.defaults.dragConsumers).toEqual({
      "openp41ge/file-path": "file-viewer",
      "openp41ge/log-stream": "log-viewer",
    });
  });

  it("shows a choice saved for a kind nothing registers now, read-only and marked", async () => {
    const c = consumers(registered);
    const p = platform({ dragConsumers: { "old-ext/thing": "old-ext/viewer" } });
    const d = await settingsBridge(extension(), p.bridge, c.source).describe(PLATFORM_SETTINGS_ID);
    const stale = dragSchema(d).properties["old-ext/thing"];
    expect(stale).toMatchObject({ enum: ["old-ext/viewer"], readOnly: true });
    expect(stale.default).toBeUndefined();
    expect(stale.description).toMatch(/^Not registered/);
    expect(d!.overrides.dragConsumers).toEqual({ "old-ext/thing": "old-ext/viewer" });
  });

  it("saves only registered consumers of registered kinds (and choices already saved)", async () => {
    const c = consumers(registered);
    const p = platform({ dragConsumers: { "old-ext/thing": "old-ext/viewer" } });
    const bridge = settingsBridge(extension(), p.bridge, c.source);
    await bridge.describe(PLATFORM_SETTINGS_ID);
    await bridge.set(PLATFORM_SETTINGS_ID, {
      dragConsumers: { "openp41ge/file-path": "my-ext/viewer", "old-ext/thing": "old-ext/viewer" },
    });
    expect(p.bridge.set).toHaveBeenCalledWith("dragConsumers", {
      "openp41ge/file-path": "my-ext/viewer",
      "old-ext/thing": "old-ext/viewer",
    });
    p.bridge.set.mockClear();
    await expect(
      bridge.set(PLATFORM_SETTINGS_ID, { dragConsumers: { "openp41ge/file-path": "nope" } }),
    ).rejects.toThrow(/Invalid settings/);
    await expect(
      bridge.set(PLATFORM_SETTINGS_ID, { dragConsumers: { "new-ext/kind": "new-ext/viewer" } }),
    ).rejects.toThrow(/Invalid settings/);
    expect(p.bridge.set).not.toHaveBeenCalled();
  });

  it("reports a change of the registered consumers as a change of the platform's settings", () => {
    const c = consumers(registered);
    const seen: string[] = [];
    settingsBridge(extension(), platform().bridge, c.source).onChanged((e) =>
      seen.push(e.extensionId),
    );
    c.replace({ "openp41ge/file-path": ["file-viewer"] });
    expect(seen).toEqual([PLATFORM_SETTINGS_ID]);
  });
});

describe("settingsBridge — extensions", () => {
  it("passes every other id to the extension config bridge", async () => {
    const ext = extension();
    const bridge = settingsBridge(ext, platform().bridge);
    await bridge.describe("openp41ge-extension-explorer");
    await bridge.set("openp41ge-extension-explorer", { indentSize: 20 });
    expect(ext.describe).toHaveBeenCalledWith("openp41ge-extension-explorer");
    expect(ext.set).toHaveBeenCalledWith("openp41ge-extension-explorer", { indentSize: 20 });
  });
});

describe("settings titles", () => {
  it("calls the platform's settings Platform Settings", async () => {
    const { configEditorTitle } = await import("@openp41ge/renderer/apps/config-editor/title");
    expect(configEditorTitle(PLATFORM_SETTINGS_ID)).toBe("Platform Settings");
    expect(configEditorTitle("openp41ge-extension-explorer")).toBe("Explorer Settings");
  });
});
