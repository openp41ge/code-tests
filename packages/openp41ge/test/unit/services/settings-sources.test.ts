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
      lineHeight: 20,
      editorFontSize: 14,
      dragConsumers: {},
      editor: { maxFileSize: 1000, wordWrap: false },
      extensions: { "some-ext": {} },
    }),
    getOverrides: async () => ({
      lineHeight: 24,
      editor: { wordWrap: true },
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
      lineHeight: 20,
      editorFontSize: 14,
      dragConsumers: {},
      editor: { maxFileSize: 1000, wordWrap: false },
    });
    // The platform's settings only: extensions' sections stay out.
    expect(d?.overrides).toEqual({ lineHeight: 24, editor: { wordWrap: true } });
    expect(d?.schema.properties).toHaveProperty("dragConsumers");
    expect(d?.schema.properties).toHaveProperty("editor");
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
    expect(p.bridge.set).toHaveBeenCalledWith("lineHeight", undefined);
    expect(p.bridge.set).toHaveBeenCalledWith("editor", undefined);
    expect(p.bridge.set).not.toHaveBeenCalledWith("extensions", expect.anything());
  });

  it("saves the file editor's settings, and refuses a wrong type there", async () => {
    const p = platform();
    const bridge = settingsBridge(extension(), p.bridge);
    await bridge.set(PLATFORM_SETTINGS_ID, { editor: { maxFileSize: 2048, wordWrap: true } });
    expect(p.bridge.set).toHaveBeenCalledWith("editor", { maxFileSize: 2048, wordWrap: true });
    await expect(bridge.set(PLATFORM_SETTINGS_ID, { editor: { wordWrap: "yes" } })).rejects.toThrow(
      /wordWrap/,
    );
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
