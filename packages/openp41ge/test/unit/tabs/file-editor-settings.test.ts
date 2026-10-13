/**
 * The file viewer's editor settings: each comes from `editor/file`, else
 * `editor/*` (every editor), else its default. Line height and font size are
 * shared; the size limit, word wrap and the save cleanup are the file
 * editor's own. A change to any `editor/` setting is applied at once.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GLOBAL_SETTINGS_SCHEMA } from "@openp41ge/renderer/models/global-settings-schema";

const config: Record<string, unknown> = {};
vi.mock("@openp41ge/renderer/app", () => ({
  appServices: {
    configService: {
      getSyntaxTheme: () => "default",
      get: (key: string) => config[key],
    },
  },
}));

const { FileEditorController } = await import(
  "@openp41ge/renderer/apps/file-viewer/file-editor-controller"
);

function editorStub() {
  return Object.assign(document.createElement("div"), {
    setEditorLineHeight: vi.fn(),
    setEditorFontSize: vi.fn(),
    setWordWrapDefault: vi.fn(),
    setSaveCleanup: vi.fn(),
    setTheme: vi.fn(),
  });
}

function mount() {
  const controller = new FileEditorController("tab-1", "file-editor", "/a.txt");
  const editor = editorStub();
  const c = controller as unknown as {
    _editor: unknown;
    _applyEditorSettings(): void;
    _attachEventBridge(): void;
  };
  c._editor = editor;
  c._applyEditorSettings();
  return { controller, editor, c };
}

beforeEach(() => {
  for (const key of Object.keys(config)) delete config[key];
});

describe("file viewer editor settings", () => {
  it("save cleanup: both on when not set; each can be turned off in editor/file", () => {
    expect(mount().editor.setSaveCleanup).toHaveBeenLastCalledWith({
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
    });
    config["editor/file.trimTrailingWhitespace"] = false;
    expect(mount().editor.setSaveCleanup).toHaveBeenLastCalledWith({
      trimTrailingWhitespace: false,
      insertFinalNewline: true,
    });
    config["editor/file.trimTrailingWhitespace"] = true;
    config["editor/file.insertFinalNewline"] = false;
    expect(mount().editor.setSaveCleanup).toHaveBeenLastCalledWith({
      trimTrailingWhitespace: true,
      insertFinalNewline: false,
    });
  });

  it("line height and font size: editor/file wins over editor/*", () => {
    config["editor/*.lineHeight"] = 22;
    config["editor/*.fontSize"] = 15;
    let { editor } = mount();
    expect(editor.setEditorLineHeight).toHaveBeenLastCalledWith(22);
    expect(editor.setEditorFontSize).toHaveBeenLastCalledWith(15);
    config["editor/file.lineHeight"] = 26;
    config["editor/file.fontSize"] = 12;
    ({ editor } = mount());
    expect(editor.setEditorLineHeight).toHaveBeenLastCalledWith(26);
    expect(editor.setEditorFontSize).toHaveBeenLastCalledWith(12);
  });

  it("word wrap comes from editor/file", () => {
    config["editor/file.wordWrap"] = true;
    expect(mount().editor.setWordWrapDefault).toHaveBeenLastCalledWith(true);
  });

  it("re-applies when any editor/ setting changes", () => {
    const { editor, c } = mount();
    c._attachEventBridge();
    config["editor/file.insertFinalNewline"] = false;
    document.dispatchEvent(
      new CustomEvent("openp41ge:config-changed", {
        detail: { key: "editor/file", value: { insertFinalNewline: false } },
      }),
    );
    expect(editor.setSaveCleanup).toHaveBeenLastCalledWith({
      trimTrailingWhitespace: true,
      insertFinalNewline: false,
    });
    config["editor/*.lineHeight"] = 30;
    document.dispatchEvent(
      new CustomEvent("openp41ge:config-changed", { detail: { key: "editor/*.lineHeight", value: 30 } }),
    );
    expect(editor.setEditorLineHeight).toHaveBeenLastCalledWith(30);
  });

  it("the schema: editor/* shared, editor/file the file editor's, editor/json overrides", () => {
    const props = GLOBAL_SETTINGS_SCHEMA.properties as unknown as Record<
      string,
      { properties: Record<string, { type: string; description: string }>; additionalProperties: boolean }
    >;
    expect(Object.keys(props["editor/*"].properties).sort()).toEqual(["fontSize", "lineHeight"]);
    expect(Object.keys(props["editor/file"].properties).sort()).toEqual([
      "fontSize",
      "insertFinalNewline",
      "lineHeight",
      "maxFileSize",
      "trimTrailingWhitespace",
      "wordWrap",
    ]);
    expect(Object.keys(props["editor/json"].properties).sort()).toEqual(["fontSize", "lineHeight"]);
    for (const section of ["editor/*", "editor/file", "editor/json"]) {
      expect(props[section].additionalProperties).toBe(false);
      for (const p of Object.values(props[section].properties)) expect(p.description).toBeTruthy();
    }
    expect(props["editor/file"].properties.trimTrailingWhitespace.type).toBe("boolean");
  });
});
