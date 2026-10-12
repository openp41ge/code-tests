/**
 * DOMBridge: a mousedown is reported as a click in the zone that contains it
 * — the left or right sidebar, or the grid (<tab-grid>) — wherever it is in
 * the window. A mousedown outside all three (e.g. the title bar) is not a
 * focus change.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DOMBridge } from "../../../src/renderer/services/dom-bridge";

let emitted: string[];
let bridge: DOMBridge;

function mousedown(el: Element, clientX: number) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, clientX }));
}

beforeEach(() => {
  document.body.innerHTML = `
    <div class="titlebar"><button id="title-btn">x</button></div>
    <openp41ge-sidebar side="left"><div id="left-tab"></div></openp41ge-sidebar>
    <tab-grid><div id="grid-tab"></div></tab-grid>
    <openp41ge-sidebar side="right"><div id="right-tab"></div></openp41ge-sidebar>
  `;
  emitted = [];
  bridge = new DOMBridge({
    emit: async (type: string) => {
      emitted.push(type);
    },
  } as never);
  bridge.attach();
});

afterEach(() => {
  bridge.detach();
  document.body.innerHTML = "";
});

describe("DOMBridge zones", () => {
  it("reports a click in the grid as grid-click, even near the window's left edge", () => {
    mousedown(document.getElementById("grid-tab")!, 5);
    expect(emitted.at(-1)).toBe("grid-click");
  });

  it("reports a click in each sidebar as that sidebar's click", () => {
    mousedown(document.getElementById("left-tab")!, 500);
    expect(emitted.at(-1)).toBe("sidebar-click-left");
    mousedown(document.getElementById("right-tab")!, 5);
    expect(emitted.at(-1)).toBe("sidebar-click-right");
  });

  it("reports nothing for a click outside the sidebars and the grid", () => {
    mousedown(document.getElementById("title-btn")!, 5);
    expect(emitted).toEqual([]);
  });
});
