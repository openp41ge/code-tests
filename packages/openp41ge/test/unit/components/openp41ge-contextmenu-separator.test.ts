/**
 * <openp41ge-contextmenu>: a separator spans the menu's full width (no
 * horizontal inset).
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-contextmenu";

describe("openp41ge-contextmenu separator", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is full width", async () => {
    const menu = document.createElement("openp41ge-contextmenu") as HTMLElement & {
      items: unknown[];
      updateComplete: Promise<unknown>;
    };
    menu.items = [{ label: "Copy" }, { type: "separator" }, { label: "Archive" }];
    document.body.appendChild(menu);
    await menu.updateComplete;
    const separator = menu.querySelector(".menu-separator") as HTMLElement;
    expect(separator).not.toBeNull();
    expect([...separator.classList].filter((c) => /^-?m[xlr]-/.test(c))).toEqual([]);
    expect(separator.style.marginLeft || "0").toMatch(/^0/);
    expect(separator.style.marginRight || "0").toMatch(/^0/);
  });
});
