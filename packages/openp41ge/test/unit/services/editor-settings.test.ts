// @vitest-environment jsdom
/**
 * Editor settings by kind of editor: `editor/<kind>` wins over `editor/*`.
 * The JSON editors (Settings editor, the workspace editor's JSON view)
 * follow `editor/json` / `editor/*` line height and font size, kept up to
 * date as the config changes.
 */
import { describe, it, expect, vi } from "vitest";
import {
  editorSetting,
  followJsonEditorSettings,
  isEditorSettingsKey,
} from "@openp41ge/renderer/services/editor-settings";

function source(values: Record<string, unknown>) {
  const listeners = new Set<() => void>();
  return {
    values,
    get: (key: string) => values[key],
    onChange: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit: () => listeners.forEach((fn) => fn()),
  };
}

describe("editor settings", () => {
  it("a kind's own value wins over editor/*; missing in both is undefined", () => {
    const s = source({ "editor/*.lineHeight": 20, "editor/json.lineHeight": 24 });
    expect(editorSetting(s, "json", "lineHeight")).toBe(24);
    expect(editorSetting(s, "file", "lineHeight")).toBe(20);
    expect(editorSetting(s, "file", "fontSize")).toBeUndefined();
  });

  it("recognises the editor sections' change keys", () => {
    for (const key of ["editor/*", "editor/file", "editor/json.fontSize"]) {
      expect(isEditorSettingsKey(key)).toBe(true);
    }
    for (const key of ["editor", "editorFontSize", "appTheme"]) {
      expect(isEditorSettingsKey(key)).toBe(false);
    }
  });

  it("JSON editors follow editor/json, else editor/*, and keep following", () => {
    const s = source({ "editor/*.lineHeight": 20, "editor/*.fontSize": 14, "editor/json.fontSize": 12 });
    const apply = vi.fn();
    const stop = followJsonEditorSettings(s, apply);
    expect(apply).toHaveBeenLastCalledWith({ rowHeight: 20, fontSize: 12 });
    s.values["editor/*.lineHeight"] = 26;
    s.emit();
    expect(apply).toHaveBeenLastCalledWith({ rowHeight: 26, fontSize: 12 });
    stop();
    s.values["editor/*.lineHeight"] = 30;
    s.emit();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("ignores values out of range (the editor keeps its own)", () => {
    const apply = vi.fn();
    followJsonEditorSettings(source({ "editor/*.lineHeight": 2, "editor/*.fontSize": "big" }), apply);
    expect(apply).toHaveBeenLastCalledWith({});
  });
});
