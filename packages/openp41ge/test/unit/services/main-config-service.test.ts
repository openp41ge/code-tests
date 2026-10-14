/**
 * Tests for the main process ConfigService.
 *
 * These tests create a temporary directory to simulate ~/.openp41ge/.config/
 * and verify read/write/watch behavior without touching the real config.
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  ConfigService,
  updateChannelForVersion,
} from "@openp41ge/main/services/config-service";

/** The agents extension's config section. */
const AGENTS = "extensions.openp41ge-extension-agents";

let tmpDir: string;
let configService: ConfigService;

beforeEach(() => {
  // Create a temp directory for each test
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-config-test-"));
  configService = new ConfigService(tmpDir);
});

afterEach(() => {
  configService.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ConfigService (main process)", () => {
  test("init() creates an overrides-only config file when missing", () => {
    configService.init();

    const configPath = path.join(tmpDir, ".config", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    // Defaults are implied by the platform — a fresh config stores no overrides.
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({});
  });

  test("getDefaults() returns the raw platform defaults", () => {
    configService.init();
    const d = configService.getDefaults();
    expect(d.version).toBe(1);
    expect(d.appTheme).toBe("dark");
    // Editor settings: `editor/*` for every editor, `editor/file` and
    // `editor/json` for one kind (their values win over `editor/*`).
    expect(d["editor/*"]).toEqual({ lineHeight: 20, fontSize: 14 });
    // Saving trims trailing whitespace and ends files with a newline, unless turned off.
    expect(d["editor/file"]).toEqual({
      maxFileSize: 50 * 1024 * 1024,
      wordWrap: false,
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
    });
    expect(d["editor/json"]).toEqual({});
    for (const retired of ["lineHeight", "editorFontSize", "editor"]) {
      expect(d).not.toHaveProperty(retired);
    }
    expect(d).not.toHaveProperty("syntaxThemes");
    // Which consumer opens each dropped payload kind: none chosen by default.
    expect(d.dragConsumers).toEqual({});
    // Agent settings are the agents extension's config now.
    expect(d).not.toHaveProperty("agent");
  });

  test("init() reads existing config file correctly", () => {
    // Pre-create config with custom values
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "light",
        "editor/*": { lineHeight: 24, fontSize: 16 },
        "editor/file": { wordWrap: true },
        "editor/json": { fontSize: 12 },
      }),
      "utf-8",
    );

    configService.init();

    expect(configService.get("appTheme")).toBe("light");
    expect(configService.get("editor/*.lineHeight")).toBe(24);
    expect(configService.get("editor/*.fontSize")).toBe(16);
    expect(configService.get("editor/file.wordWrap")).toBe(true);
    expect(configService.get("editor/json.fontSize")).toBe(12);
  });

  test("init() drops the retired editor.fontFamily and syntaxThemes (nothing read them)", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        editor: { fontFamily: "monospace", maxFileSize: 1024 },
        syntaxThemes: { ".ts": "monokai" },
      }),
      "utf-8",
    );

    configService.init();

    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"));
    expect(parsed).toEqual({ "editor/file": { maxFileSize: 1024 } });
  });

  /** Write `config.json`, load it, and return what is on disk afterwards. */
  function loadFile(contents: Record<string, unknown>): Record<string, unknown> {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(contents), "utf-8");
    configService.init();
    return JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"));
  }

  test("init() moves the old editor settings into editor/* and editor/file", () => {
    const parsed = loadFile({
      lineHeight: 24,
      editorFontSize: 16,
      editor: {
        maxFileSize: 1024,
        wordWrap: true,
        trimTrailingWhitespace: false,
        insertFinalNewline: false,
      },
    });
    expect(configService.get("editor/*.lineHeight")).toBe(24);
    expect(configService.get("editor/*.fontSize")).toBe(16);
    expect(configService.get("editor/file.maxFileSize")).toBe(1024);
    expect(configService.get("editor/file.wordWrap")).toBe(true);
    expect(configService.get("editor/file.trimTrailingWhitespace")).toBe(false);
    expect(configService.get("editor/file.insertFinalNewline")).toBe(false);
    // The old keys are gone from memory and from disk.
    for (const old of ["lineHeight", "editorFontSize", "editor"]) {
      expect(configService.get(old)).toBeUndefined();
      expect(parsed).not.toHaveProperty(old);
    }
    expect(parsed).toEqual({
      "editor/*": { lineHeight: 24, fontSize: 16 },
      "editor/file": {
        maxFileSize: 1024,
        wordWrap: true,
        trimTrailingWhitespace: false,
        insertFinalNewline: false,
      },
    });
  });

  test("init() keeps an old setting the user pinned at its default", () => {
    const parsed = loadFile({ lineHeight: 20, editor: { wordWrap: false } });
    expect(parsed).toEqual({ "editor/*": { lineHeight: 20 }, "editor/file": { wordWrap: false } });
  });

  test("init() moves the older nested editor.lineHeight/fontSize and top-level fontSize too", () => {
    loadFile({ editor: { lineHeight: 30, fontSize: 12, fontFamily: "monospace" } });
    expect(configService.get("editor/*.lineHeight")).toBe(30);
    expect(configService.get("editor/*.fontSize")).toBe(12);
    expect(configService.get("editor")).toBeUndefined();
    configService.destroy();
    fs.rmSync(path.join(tmpDir, ".config"), { recursive: true, force: true });
    configService = new ConfigService(tmpDir);
    const parsed = loadFile({ fontSize: 18 });
    expect(configService.get("editor/*.fontSize")).toBe(18);
    expect(parsed).toEqual({ "editor/*": { fontSize: 18 } });
  });

  test("init(): a value already in the new section wins over an old key", () => {
    const parsed = loadFile({
      lineHeight: 24,
      "editor/*": { lineHeight: 28 },
      editor: { wordWrap: true },
      "editor/file": { wordWrap: false },
    });
    expect(configService.get("editor/*.lineHeight")).toBe(28);
    expect(configService.get("editor/file.wordWrap")).toBe(false);
    expect(parsed).toEqual({ "editor/*": { lineHeight: 28 }, "editor/file": { wordWrap: false } });
  });

  test("init() renames the provider-level `model` key to `defaultModel`", () => {
    // Configs written before the rename stored the provider's default model
    // under `model` (confusable with the `models` list); they should be
    // migrated to `defaultModel` and the stale key removed.
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "dark",
        editor: { fontFamily: "monospace", maxFileSize: 1024 },
        agent: {
          providerId: "vllm",
          providers: { vllm: { baseUrl: "http://x", model: "m", apiKey: "k" } },
        },
      }),
      "utf-8",
    );

    configService.init();
    const providers = configService.get(`${AGENTS}.providers`) as Record<
      string,
      Record<string, unknown>
    >;
    expect(providers.vllm.defaultModel).toBe("m");
    expect("model" in providers.vllm).toBe(false);
    expect(providers.vllm.baseUrl).toBe("http://x");
    expect(providers.vllm.apiKey).toBe("k");
    expect(configService.get("agent")).toBeUndefined();
  });

  test("init() moves the agent settings to the agents extension's config, for good (providerId as defaultProviderId)", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        agent: {
          providerId: "vllm",
          providers: { vllm: { baseUrl: "http://x", model: "legacy", defaultModel: "cur" } },
        },
      }),
      "utf-8",
    );

    configService.init();

    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"));
    expect(parsed).toEqual({
      extensions: {
        "openp41ge-extension-agents": {
          defaultProviderId: "vllm",
          providers: { vllm: { baseUrl: "http://x", defaultModel: "cur" } },
        },
      },
    });
  });

  test("init() moves the Explorer settings to the Explorer extension's config", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ explorer: { indentSize: 24, prefetchDepth: 3 } }),
      "utf-8",
    );

    configService.init();

    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"));
    expect(parsed).toEqual({
      extensions: { "openp41ge-extension-explorer": { indentSize: 24, prefetchDepth: 3 } },
    });
  });

  test("init() keeps the Explorer extension's own config over leftover explorer settings", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        explorer: { indentSize: 24 },
        extensions: { "openp41ge-extension-explorer": { indentSize: 32 } },
      }),
      "utf-8",
    );

    configService.init();

    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"));
    expect(parsed).toEqual({
      extensions: { "openp41ge-extension-explorer": { indentSize: 32 } },
    });
  });

  test("init() keeps the agents extension's own config over leftover agent settings", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        agent: { providerId: "old" },
        extensions: { "openp41ge-extension-agents": { defaultProviderId: "new" } },
      }),
      "utf-8",
    );

    configService.init();

    expect(configService.get(`${AGENTS}.defaultProviderId`)).toBe("new");
    expect(configService.get("agent")).toBeUndefined();
  });

  test("init() back-fills the maxFileSize default for legacy config files", () => {
    // A config written before the size limit existed must get the 50MB
    // default via deepMerge rather than a missing/undefined value.
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "dark",
        editor: { fontFamily: "monospace" },
      }),
      "utf-8",
    );

    configService.init();
    expect(configService.get("editor/file.maxFileSize")).toBe(50 * 1024 * 1024);
  });

  test("init() deep-merges existing config with defaults", () => {
    // Config with only some fields — missing fields should use defaults
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "light",
      }),
      "utf-8",
    );

    configService.init();

    // Custom value preserved
    expect(configService.get("appTheme")).toBe("light");
    // Defaults filled in
    expect(configService.get("editor/*.lineHeight")).toBe(20);
    expect(configService.get("editor/*.fontSize")).toBe(14);
    // The auto-update channel defaults to the stable "latest" track.
    expect(configService.get("updateChannel")).toBe("latest");
    expect(configService.get("editor/file.wordWrap")).toBe(false);
  });

  test("updateChannelForVersion derives the channel from the version's prerelease track", () => {
    expect(updateChannelForVersion("0.1.0-alpha.10")).toBe("alpha");
    expect(updateChannelForVersion("0.1.0-beta.3")).toBe("beta");
    expect(updateChannelForVersion("0.1.0-rc.1")).toBe("rc");
    expect(updateChannelForVersion("0.1.0")).toBe("latest");
    expect(updateChannelForVersion("")).toBe("latest");
    // Case-insensitive; a prerelease segment mid-tag is ignored (e.g. "v" prefix).
    expect(updateChannelForVersion("0.1.0-ALPHA.2")).toBe("alpha");
  });

  test("a prerelease default channel is implied, not persisted as an override", () => {
    const svc = new ConfigService(tmpDir, "alpha");
    svc.init();

    // The effective channel follows the build's prerelease track, so the
    // updater checks the alpha feed (not the empty stable "latest" feed).
    expect(svc.get("updateChannel")).toBe("alpha");
    expect(svc.getDefaults().updateChannel).toBe("alpha");

    // The implied default is not stored as a user override.
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, ".config", "config.json"), "utf-8"));
    expect(parsed).toEqual({});
  });

  test("an explicitly pinned update channel survives over the per-build default", () => {
    const svc = new ConfigService(tmpDir, "alpha");
    svc.init();
    svc.set("updateChannel", "beta");

    expect(svc.get("updateChannel")).toBe("beta");
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, ".config", "config.json"), "utf-8"));
    expect(parsed.updateChannel).toBe("beta");
  });

  test("getAll() returns the full config object", () => {
    configService.init();
    const all = configService.getAll();
    expect(all).toBeDefined();
    expect(all.version).toBe(1);
    expect(all.appTheme).toBeDefined();
    expect(all["editor/*"]).toBeDefined();
    expect(all.dragConsumers).toEqual({});
  });

  test("get() returns undefined for unknown keys", () => {
    configService.init();
    expect(configService.get("nonexistent")).toBeUndefined();
    expect(configService.get("editor/file.nonexistent")).toBeUndefined();
  });

  test("get() with no key returns the entire config", () => {
    configService.init();
    const all = configService.get() as Record<string, unknown>;
    expect(all.version).toBe(1);
  });

  test("set() persists a value and updates the in-memory config", () => {
    configService.init();
    configService.set("appTheme", "light");

    expect(configService.get("appTheme")).toBe("light");

    // Verify on disk
    const configPath = path.join(tmpDir, ".config", "config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.appTheme).toBe("light");
  });

  test("set() supports nested keys", () => {
    configService.init();
    configService.set("editor/*.lineHeight", 30);
    configService.set("editor/json.fontSize", 18);

    expect(configService.get("editor/*.lineHeight")).toBe(30);
    expect(configService.get("editor/json.fontSize")).toBe(18);
  });

  test("getOverrides() returns only the user-written overrides", () => {
    configService.init();
    // Fresh config: nothing overridden → empty overrides document.
    expect(configService.getOverrides()).toEqual({});
    configService.set("editor/*.lineHeight", 30);
    expect(configService.getOverrides()).toEqual({ "editor/*": { lineHeight: 30 } });
    // Defaults themselves are NOT overrides.
    expect(configService.getOverrides()).not.toHaveProperty("appTheme");
  });

  test("getOverrides() and the persisted file are alphabetised on save", () => {
    configService.init();
    // Set keys in a non-alphabetical order (updateChannel before the editor sections).
    configService.set("updateChannel", "alpha");
    configService.set("editor/file.wordWrap", true);
    configService.set("editor/*.lineHeight", 30);
    // The overrides doc read back is sorted by key.
    expect(Object.keys(configService.getOverrides())).toEqual([
      "editor/*",
      "editor/file",
      "updateChannel",
    ]);
    // And the written file is sorted too.
    const parsed = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".config", "config.json"), "utf-8"),
    );
    expect(Object.keys(parsed)).toEqual(["editor/*", "editor/file", "updateChannel"]);
  });

  test("set() persists an explicit pin even when it equals the default", () => {
    configService.init();
    // The user explicitly sets a value that happens to equal the default.
    configService.set("editor/*.lineHeight", 20);

    const configPath = path.join(tmpDir, ".config", "config.json");
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    // It's stored (not pruned) so a future default change won't move it silently.
    expect(parsed).toEqual({ "editor/*": { lineHeight: 20 } });
    expect(configService.getOverrides()).toEqual({ "editor/*": { lineHeight: 20 } });
    expect(configService.get("editor/*.lineHeight")).toBe(20);
  });

  test("a pinned value in the config file survives a restart", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ "editor/*": { lineHeight: 20 } }),
      "utf-8",
    );
    configService.init();
    // The pin is remembered as an override and not pruned on the next write.
    expect(configService.getOverrides()).toEqual({ "editor/*": { lineHeight: 20 } });
    configService.set("editor/*.fontSize", 16);
    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"));
    expect(parsed).toEqual({ "editor/*": { lineHeight: 20, fontSize: 16 } });
  });

  test("a bulk container write does NOT pin its default-valued leaves", () => {
    configService.init();
    // Saving a whole object must not persist every leaf — only the leaves
    // that actually differ from default.
    configService.set("editor/file", { maxFileSize: 50 * 1024 * 1024 });
    const configPath = path.join(tmpDir, ".config", "config.json");
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    // Everything is at its default → the editor section is pruned entirely.
    expect(parsed).not.toHaveProperty("editor/file");
  });

  test("onChange() fires when config is updated via set()", () => {
    configService.init();
    let changed = false;
    const unsub = configService.onChange(() => {
      changed = true;
    });

    configService.set("appTheme", "light");
    expect(changed).toBe(true);
    unsub();
  });

  test("onChange() unsubscribe works", () => {
    configService.init();
    let callCount = 0;
    const fn = () => callCount++;
    const unsub = configService.onChange(fn);

    configService.set("appTheme", "light");
    expect(callCount).toBe(1);

    unsub();
    configService.set("appTheme", "dark");
    // Should not have incremented since unsubscribed
    expect(callCount).toBe(1);
  });

  test("init() does not fail when config file has invalid JSON", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "not valid json", "utf-8");

    // Should fall back to defaults without throwing
    configService.init();
    expect(configService.get("appTheme")).toBe("dark");
  });

  test("destroy() stops the file watcher", () => {
    configService.init();
    expect(() => configService.destroy()).not.toThrow();
  });
});
