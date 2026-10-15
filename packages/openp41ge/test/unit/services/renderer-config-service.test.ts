/**
 * Tests for the renderer ConfigService.
 *
 * These tests mock window.openp41ge.config to simulate IPC calls.
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";

// Mock window.openp41ge.config before importing ConfigService
const mockConfig: { appTheme: string } & Record<string, unknown> = {
  version: 1,
  appTheme: "dark",
  lineHeight: 20,
  editorFontSize: 14,
  editor: {
    maxFileSize: 50 * 1024 * 1024,
  },
};

let setCallKey: string | null = null;
let setCallValue: unknown = null;
let onChangedHandler: ((value: unknown) => void) | null = null;

(globalThis as any).window = {
  openp41ge: {
    config: {
      getAll: async () => ({ ...mockConfig }),
      get: async (key?: string) => {
        if (!key) return { ...mockConfig };
        const keys = key.split(".");
        let obj: any = { ...mockConfig };
        for (const k of keys) obj = obj[k];
        return obj;
      },
      set: async (key: string, value: unknown) => {
        setCallKey = key;
        setCallValue = value;
      },
      onChanged: (handler: (value: unknown) => void) => {
        onChangedHandler = handler;
        return () => {};
      },
    },
  },
  document: {
    documentElement: { setAttribute: () => {} },
    addEventListener: () => {},
    dispatchEvent: () => {},
    createElement: () => ({}),
  },
} as any;

// Event tracking
let dispatchedEvents: Array<{ type: string; detail: any }> = [];
(globalThis as any).document = {
  documentElement: { setAttribute: () => {} },
  addEventListener: () => {},
  dispatchEvent: (evt: any) => {
    dispatchedEvents.push({ type: evt.type, detail: evt.detail });
  },
  createElement: () => ({}),
};

// Now import
import { ConfigService } from "@openp41ge/renderer/services/config-service";
import { GLOBAL_SETTINGS_SCHEMA } from "@openp41ge/renderer/models/global-settings-schema";

let configService: ConfigService;

beforeEach(() => {
  configService = new ConfigService();
  setCallKey = null;
  setCallValue = null;
  onChangedHandler = null;
  dispatchedEvents = [];
});

afterEach(() => {
  // No cleanup needed
});

describe("ConfigService (renderer)", () => {
  test("loaded is false before load()", () => {
    expect(configService.loaded).toBe(false);
  });

  test("load() populates the config cache", async () => {
    await configService.load();
    expect(configService.loaded).toBe(true);
  });

  test("getAll() returns null before load()", () => {
    expect(configService.getAll()).toBeNull();
  });

  test("getAll() returns config after load()", async () => {
    await configService.load();
    const all = configService.getAll();
    expect(all).not.toBeNull();
    expect(all!.appTheme).toBe("dark");
    expect(all!.lineHeight).toBe(20);
  });

  test("get() returns the correct value for a top-level key", async () => {
    await configService.load();
    expect(configService.get("appTheme")).toBe("dark");
  });

  test("get() returns the correct value for a nested key", async () => {
    await configService.load();
    expect(configService.get("lineHeight")).toBe(20);
    expect(configService.get("editorFontSize")).toBe(14);
  });

  test("get('editor.maxFileSize') reads the stored byte limit", async () => {
    await configService.load();
    expect(configService.get("editor.maxFileSize")).toBe(50 * 1024 * 1024);
  });

  test("set('editor.maxFileSize', n) round-trips the byte value and emits config-changed", async () => {
    await configService.load();
    await configService.set("editor.maxFileSize", 20 * 1024 * 1024);
    expect(setCallKey).toBe("editor.maxFileSize");
    expect(setCallValue).toBe(20 * 1024 * 1024);
    expect(configService.get("editor.maxFileSize")).toBe(20 * 1024 * 1024);
    const evt = dispatchedEvents.find((e) => e.type === "openp41ge:config-changed");
    expect(evt?.detail).toEqual({
      key: "editor.maxFileSize",
      value: 20 * 1024 * 1024,
    });
  });

  test("get() returns undefined for unknown keys", async () => {
    await configService.load();
    expect(configService.get("nonexistent")).toBeUndefined();
  });

  test("getSyntaxTheme() returns the default theme", async () => {
    await configService.load();
    expect(configService.getSyntaxTheme()).toBe("openp41ge-dark");
  });

  test("getAppTheme() returns dark before load()", () => {
    expect(configService.getAppTheme()).toBe("dark");
  });

  test("getAppTheme() returns config value after load()", async () => {
    // Recreate with light theme
    (globalThis as any).window.openp41ge.config.getAll = async () => ({
      ...mockConfig,
      appTheme: "light" as const,
    });
    await configService.load();
    expect(configService.getAppTheme()).toBe("light");
    // Reset
    (globalThis as any).window.openp41ge.config.getAll = async () => ({ ...mockConfig });
  });

  test("set() calls window.openp41ge.config.set and dispatches event", async () => {
    await configService.load();
    const prevLen = dispatchedEvents.length;

    await configService.set("appTheme", "light");

    expect(setCallKey).toBe("appTheme");
    expect(setCallValue).toBe("light");
    // Should have dispatched a openp41ge:config-changed event
    const newEvents = dispatchedEvents.slice(prevLen);
    const configEvent = newEvents.find((e) => e.type === "openp41ge:config-changed");
    expect(configEvent).toBeDefined();
    expect(configEvent!.detail.key).toBe("appTheme");
    expect(configEvent!.detail.value).toBe("light");
  });

  test("onChange() fires when config changes", async () => {
    await configService.load();
    let changed = false;
    const unsub = configService.onChange(() => {
      changed = true;
    });

    await configService.set("appTheme", "light");
    expect(changed).toBe(true);
    unsub();
  });

  test("onKeyChange() fires only for the matching key", async () => {
    await configService.load();
    let lineHeightChanged = false;
    let fontSizeChanged = false;

    configService.onKeyChange("lineHeight", () => {
      lineHeightChanged = true;
    });
    configService.onKeyChange("editorFontSize", () => {
      fontSizeChanged = true;
    });

    await configService.set("lineHeight", 30);
    expect(lineHeightChanged).toBe(true);
    expect(fontSizeChanged).toBe(false);
  });

  test("onChanged() (cross-window) updates the cache and dispatches config-changed", async () => {
    await configService.load();
    expect(onChangedHandler).not.toBeNull();
    // A change made in ANOTHER window (e.g. the manager Settings tab) arrives
    // as a main-process broadcast: { key, value }.
    onChangedHandler!({ key: "editorFontSize", value: 18 });
    expect(configService.get("editorFontSize")).toBe(18);
    const evt = dispatchedEvents.find((e) => e.type === "openp41ge:config-changed");
    expect(evt).toBeTruthy();
    expect(evt!.detail.key).toBe("editorFontSize");
    expect(evt!.detail.value).toBe(18);
  });

  test("applyAppTheme() sets data-app-theme on documentElement", async () => {
    await configService.load();
    let attribute: string | null = null;
    let value: string | null = null;
    const origSetAttribute = document.documentElement.setAttribute;
    document.documentElement.setAttribute = (attr: string, val: string) => {
      attribute = attr;
      value = val;
    };

    configService.applyAppTheme();
    expect(attribute).toBe("data-app-theme");
    expect(value).toBe("dark");

    document.documentElement.setAttribute = origSetAttribute;
  });
});

describe("ConfigService (renderer) — the system theme", () => {
  /** A stand-in for the OS colour scheme, switched by the test. */
  class FakeScheme {
    dark = true;
    private _listeners = new Set<() => void>();
    isDark(): boolean {
      return this.dark;
    }
    onChange(fn: () => void): () => void {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }
    switchTo(dark: boolean): void {
      this.dark = dark;
      for (const fn of this._listeners) fn();
    }
  }

  let applied: string[];
  let origSetAttribute: typeof document.documentElement.setAttribute;
  beforeEach(() => {
    applied = [];
    origSetAttribute = document.documentElement.setAttribute;
    document.documentElement.setAttribute = (attr: string, val: string) => {
      if (attr === "data-app-theme") applied.push(val);
    };
  });
  afterEach(() => {
    document.documentElement.setAttribute = origSetAttribute;
    mockConfig.appTheme = "dark";
  });

  test('the appTheme setting offers "system" next to "dark" and "light"', () => {
    const props = GLOBAL_SETTINGS_SCHEMA.properties as unknown as Record<
      string,
      { enum?: unknown[] }
    >;
    expect(props.appTheme.enum).toEqual(["system", "dark", "light"]);
  });

  test('"system" applies the OS colour scheme', async () => {
    mockConfig.appTheme = "system";
    const scheme = new FakeScheme();
    scheme.dark = false;
    const service = new ConfigService(scheme);
    await service.load();
    expect(service.getAppTheme()).toBe("system");
    expect(service.getResolvedAppTheme()).toBe("light");
    service.applyAppTheme();
    expect(applied).toEqual(["light"]);
  });

  test('"system" follows the OS colour scheme as it changes', async () => {
    mockConfig.appTheme = "system";
    const scheme = new FakeScheme();
    const service = new ConfigService(scheme);
    await service.load();
    service.applyAppTheme();
    scheme.switchTo(false);
    scheme.switchTo(true);
    expect(applied).toEqual(["dark", "light", "dark"]);
  });

  test("a chosen theme ignores the OS colour scheme", async () => {
    mockConfig.appTheme = "dark";
    const scheme = new FakeScheme();
    const service = new ConfigService(scheme);
    await service.load();
    service.applyAppTheme();
    scheme.switchTo(false);
    expect(applied).toEqual(["dark"]);
    expect(service.getResolvedAppTheme()).toBe("dark");
  });

  test('switching to "system" from another window applies the OS colour scheme', async () => {
    const scheme = new FakeScheme();
    scheme.dark = false;
    const service = new ConfigService(scheme);
    await service.load();
    service.applyAppTheme();
    onChangedHandler!({ key: "appTheme", value: "system" });
    service.applyAppTheme();
    expect(applied).toEqual(["dark", "light"]);
    // ...and follows it from then on.
    scheme.switchTo(true);
    expect(applied).toEqual(["dark", "light", "dark"]);
  });

  test("an unset theme is dark", async () => {
    const service = new ConfigService(new FakeScheme());
    await service.load();
    onChangedHandler!({ key: "appTheme", value: undefined });
    expect(service.getAppTheme()).toBe("dark");
  });

  test("applying the theme again does not follow the OS colour scheme twice", async () => {
    mockConfig.appTheme = "system";
    const scheme = new FakeScheme();
    const service = new ConfigService(scheme);
    await service.load();
    service.applyAppTheme();
    service.applyAppTheme();
    applied = [];
    scheme.switchTo(false);
    expect(applied).toEqual(["light"]);
  });
});

describe("ConfigService (renderer) — editor sections (keys with a slash)", () => {
  test("a section key with a slash is one key: get, and cross-window changes", async () => {
    await configService.load();
    onChangedHandler!({ key: "editor/file", value: { maxFileSize: 1024, wordWrap: true } });
    expect(configService.get("editor/file.maxFileSize")).toBe(1024);
    expect(configService.get("editor/file.wordWrap")).toBe(true);
    onChangedHandler!({ key: "editor/*.lineHeight", value: 26 });
    expect(configService.get("editor/*.lineHeight")).toBe(26);
    expect(configService.get("editor/*")).toEqual({ lineHeight: 26 });
  });
});
