// @ts-nocheck
/**
 * Regression test: Cmd/Ctrl+S in a <file-editor> saves the file (writes the
 * buffer through the host's file API and marks it clean). The editor handled
 * Cmd+F / Cmd+G but not save, so in the app Cmd+S did nothing.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-core-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

async function mountEditor(readOnly = false): Promise<HTMLElement & any> {
  const el = document.createElement("file-editor");
  el.filePath = "/repo/app.ts";
  el.fileName = "app.ts";
  el.setReadOnly(readOnly);
  el.textContentModel = new PieceTreeTextContentModel("file:///app.ts", "const x = 1;\n");
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

function keyOn(el, init: KeyboardEventInit) {
  const ta = el.querySelector("textarea");
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  ta.dispatchEvent(e);
  return e;
}

describe("file-editor Cmd/Ctrl+S", () => {
  let writeFile: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    document.body.innerHTML = "";
    writeFile = vi.fn(async () => ({ success: true }));
    (window as any).openp41ge = { file: { writeFile } };
  });

  test("Cmd+S writes the edited buffer and marks it clean", async () => {
    const el = await mountEditor();
    const ta = el.querySelector("textarea");
    ta.value = "y";
    ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    expect(el.getState().isDirty).toBe(true);

    const e = keyOn(el, { key: "s", metaKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(e.defaultPrevented).toBe(true);
    expect(writeFile).toHaveBeenCalledWith("/repo/app.ts", el.textContentModel.getValue());
    expect(el.getState().isDirty).toBe(false);
  });

  test("Ctrl+S saves too", async () => {
    const el = await mountEditor();
    keyOn(el, { key: "s", ctrlKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  test("a read-only editor does not write", async () => {
    const el = await mountEditor(true);
    keyOn(el, { key: "s", metaKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(writeFile).not.toHaveBeenCalled();
  });
});
