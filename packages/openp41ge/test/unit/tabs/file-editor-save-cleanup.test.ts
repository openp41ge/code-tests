/**
 * The file viewer passes the `editor.trimTrailingWhitespace` and
 * `editor.insertFinalNewline` settings to its editor's save cleanup; both
 * are on unless set to false. They appear in the settings schema, so the
 * settings editor accepts and describes them.
 */
import { describe, it, expect, vi } from "vitest";
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
  return {
    setEditorLineHeight: vi.fn(),
    setEditorFontSize: vi.fn(),
    setWordWrapDefault: vi.fn(),
    setSaveCleanup: vi.fn(),
  };
}

function apply(): ReturnType<typeof editorStub>["setSaveCleanup"] {
  const controller = new FileEditorController("tab-1", "file-editor", "/a.txt");
  const editor = editorStub();
  (controller as unknown as { _editor: unknown })._editor = editor;
  (controller as unknown as { _applyEditorSettings(): void })._applyEditorSettings();
  return editor.setSaveCleanup;
}

describe("file viewer save cleanup settings", () => {
  it("both on when not set", () => {
    delete config["editor.trimTrailingWhitespace"];
    delete config["editor.insertFinalNewline"];
    expect(apply()).toHaveBeenCalledWith({ trimTrailingWhitespace: true, insertFinalNewline: true });
  });

  it("each can be turned off", () => {
    config["editor.trimTrailingWhitespace"] = false;
    config["editor.insertFinalNewline"] = true;
    expect(apply()).toHaveBeenCalledWith({ trimTrailingWhitespace: false, insertFinalNewline: true });
    config["editor.trimTrailingWhitespace"] = true;
    config["editor.insertFinalNewline"] = false;
    expect(apply()).toHaveBeenCalledWith({ trimTrailingWhitespace: true, insertFinalNewline: false });
  });

  it("are in the settings schema as booleans", () => {
    const editor = GLOBAL_SETTINGS_SCHEMA.properties.editor.properties as Record<
      string,
      { type: string; description: string }
    >;
    for (const key of ["trimTrailingWhitespace", "insertFinalNewline"]) {
      expect(editor[key]?.type).toBe("boolean");
      expect(editor[key]?.description).toBeTruthy();
    }
  });
});
