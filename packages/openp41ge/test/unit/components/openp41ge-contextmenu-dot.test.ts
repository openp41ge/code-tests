/**
 * <openp41ge-contextmenu>: an item can carry a dot (something to review).
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-contextmenu";

describe("openp41ge-contextmenu item dot", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("draws a dot after the label of an item that asks for one", async () => {
    const menu = document.createElement("openp41ge-contextmenu") as HTMLElement & {
      items: unknown[];
      updateComplete: Promise<unknown>;
    };
    menu.items = [{ label: "Cleanup", dot: true }, { label: "Settings" }];
    document.body.appendChild(menu);
    await menu.updateComplete;
    const dots = menu.querySelectorAll(".menu-item-dot");
    expect(dots).toHaveLength(1);
    expect(dots[0].closest("div")?.textContent).toContain("Cleanup");
  });
});
