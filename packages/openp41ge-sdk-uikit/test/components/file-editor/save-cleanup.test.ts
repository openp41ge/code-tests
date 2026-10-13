// @ts-nocheck
/**
 * Saving can tidy the file first (`setSaveCleanup`): trim trailing
 * whitespace from every line, and end the file with a newline. The buffer
 * is edited (one undoable step) before it is written, so what is on screen
 * is what was saved. Both are off unless the host turns them on.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-core-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

async function mountEditor(text: string): Promise<HTMLElement & any> {
  const el = document.createElement("file-editor");
  el.filePath = "/repo/a.txt";
  el.fileName = "a.txt";
  el.textContentModel = new PieceTreeTextContentModel("file:///a.txt", text);
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

describe("file-editor save cleanup", () => {
  let writeFile: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    document.body.innerHTML = "";
    writeFile = vi.fn(async () => ({ success: true }));
    (window as any).openp41ge = { file: { writeFile } };
  });

  const saved = () => writeFile.mock.calls.at(-1)[1];

  test("off by default: the buffer is written as it is", async () => {
    const el = await mountEditor("a  \nb\t");
    expect(await el.save()).toBe(true);
    expect(saved()).toBe("a  \nb\t");
  });

  test("both on: trailing whitespace trimmed and a final newline added, in the buffer too", async () => {
    const el = await mountEditor("a  \n  b\t\nc");
    el.setSaveCleanup({ trimTrailingWhitespace: true, insertFinalNewline: true });
    expect(await el.save()).toBe(true);
    expect(saved()).toBe("a\n  b\nc\n");
    expect(el.textContentModel.getValue()).toBe("a\n  b\nc\n");
    expect(el.getState().isDirty).toBe(false);
  });

  test("a last line of only whitespace counts as the final newline's empty line", async () => {
    const el = await mountEditor("a\n   ");
    el.setSaveCleanup({ trimTrailingWhitespace: true, insertFinalNewline: true });
    await el.save();
    expect(saved()).toBe("a\n");
  });

  test("an empty file stays empty; a file already ending in a newline gets no second one", async () => {
    const empty = await mountEditor("");
    empty.setSaveCleanup({ trimTrailingWhitespace: true, insertFinalNewline: true });
    await empty.save();
    expect(saved()).toBe("");
    const done = await mountEditor("a\n");
    done.setSaveCleanup({ trimTrailingWhitespace: true, insertFinalNewline: true });
    const version = done.textContentModel.versionId;
    await done.save();
    expect(saved()).toBe("a\n");
    expect(done.textContentModel.versionId).toBe(version);
  });

  test("each works on its own", async () => {
    const trim = await mountEditor("a  \nb  ");
    trim.setSaveCleanup({ trimTrailingWhitespace: true, insertFinalNewline: false });
    await trim.save();
    expect(saved()).toBe("a\nb");
    const newline = await mountEditor("a  \nb  ");
    newline.setSaveCleanup({ trimTrailingWhitespace: false, insertFinalNewline: true });
    await newline.save();
    expect(saved()).toBe("a  \nb  \n");
  });

  test("keeps Windows line endings", async () => {
    const el = await mountEditor("a  \r\nb");
    el.setSaveCleanup({ trimTrailingWhitespace: true, insertFinalNewline: true });
    await el.save();
    expect(saved()).toBe("a\r\nb\r\n");
  });

  test("a read-only editor changes nothing", async () => {
    const el = await mountEditor("a  ");
    el.setReadOnly(true);
    el.setSaveCleanup({ trimTrailingWhitespace: true, insertFinalNewline: true });
    expect(await el.save()).toBe(false);
    expect(el.textContentModel.getValue()).toBe("a  ");
  });
});
