// @ts-nocheck
/**
 * Every <json-editor> follows shared defaults (`setJsonEditorDefaults`):
 * row height and font size, set by the host app from its editor settings.
 * Mounted editors update when they change; an editor's own `rowHeight` /
 * `fontSize` property wins.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../src/json-editor/json-editor";
import { setJsonEditorDefaults } from "../../src/json-editor/json-editor";

async function mount(props: Record<string, unknown> = {}) {
  const el = document.createElement("json-editor");
  el.value = { a: 1 };
  Object.assign(el, props);
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 20));
  return el;
}

const rowHeight = (el) => el.style.getPropertyValue("--je-row-height");
const fontSize = (el) => el.style.getPropertyValue("--je-font-size");

afterEach(() => {
  document.body.innerHTML = "";
  setJsonEditorDefaults({ rowHeight: 20, fontSize: 13 });
});

describe("json-editor shared defaults", () => {
  test("built-in: 20px rows, 13px text", async () => {
    const el = await mount();
    expect(rowHeight(el)).toBe("20px");
    expect(fontSize(el)).toBe("13px");
  });

  test("new and mounted editors follow the defaults", async () => {
    const before = await mount();
    setJsonEditorDefaults({ rowHeight: 26, fontSize: 15 });
    await new Promise((r) => setTimeout(r, 0));
    expect(rowHeight(before)).toBe("26px");
    expect(fontSize(before)).toBe("15px");
    const after = await mount();
    expect(rowHeight(after)).toBe("26px");
    expect(fontSize(after)).toBe("15px");
  });

  test("a partial update keeps the other default", async () => {
    setJsonEditorDefaults({ fontSize: 16 });
    const el = await mount();
    expect(rowHeight(el)).toBe("20px");
    expect(fontSize(el)).toBe("16px");
  });

  test("an editor's own rowHeight / fontSize wins", async () => {
    setJsonEditorDefaults({ rowHeight: 26, fontSize: 15 });
    const el = await mount({ rowHeight: 30, fontSize: 11 });
    expect(rowHeight(el)).toBe("30px");
    expect(fontSize(el)).toBe("11px");
  });
});
