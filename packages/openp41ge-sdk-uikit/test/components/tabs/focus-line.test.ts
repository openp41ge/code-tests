/**
 * The focus line: one element per document, over the focused tab handle. It
 * floats half above the tab — a 3px bar, half the tab's width and centred,
 * straddling the tab's top edge — so it is drawn outside the tab bars (which
 * scroll, and would clip it): fixed, on the document's body. It follows the
 * tab as anything around it scrolls, and is clipped to the visible part of
 * the tab bar (hidden when the tab is scrolled out of it). The tab bar that
 * shows it is its owner; another owner's hide does not remove it.
 */
import { describe, test, expect, afterEach } from "vitest";
import { focusLineLayer } from "../../../src/components/tabs/focus-line";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect;
}

/** A tab in a scrolling bar; rects are set by the test. */
function setup() {
  const bar = document.createElement("div");
  const tab = document.createElement("div");
  bar.appendChild(tab);
  document.body.appendChild(bar);
  let tabRect = rect(100, 40, 120, 34);
  let barRect = rect(0, 40, 600, 35);
  tab.getBoundingClientRect = () => tabRect;
  bar.getBoundingClientRect = () => barRect;
  Object.defineProperty(bar, "scrollWidth", { value: 900, configurable: true });
  Object.defineProperty(bar, "clientWidth", { value: 600, configurable: true });
  return {
    bar,
    tab,
    moveTab: (r: DOMRect) => (tabRect = r),
    moveBar: (r: DOMRect) => (barRect = r),
  };
}

const style = () => focusLineLayer().element.style;
const owner = {};

afterEach(() => {
  focusLineLayer().hide(owner);
  document.body.innerHTML = "";
});

describe("focus line", () => {
  test("floats half above the focused tab: half its width, centred, 3px, rounded", () => {
    const { tab } = setup();
    focusLineLayer().show(tab, owner);
    const el = focusLineLayer().element;
    expect(el.parentElement).toBe(document.body);
    expect(style().position).toBe("fixed");
    expect(style().pointerEvents).toBe("none");
    expect(style().left).toBe("130px");
    expect(style().width).toBe("60px");
    expect(style().top).toBe("38.5px");
    expect(style().height).toBe("3px");
    expect(style().borderRadius).not.toBe("");
    expect(style().background).toMatch(/#4a9eff|rgb\(74, 158, 255\)/);
  });

  test("follows the tab when something around it scrolls", () => {
    const { bar, tab, moveTab } = setup();
    focusLineLayer().show(tab, owner);
    moveTab(rect(20, 40, 120, 34));
    bar.dispatchEvent(new Event("scroll"));
    expect(style().left).toBe("50px");
  });

  test("is clipped to the visible part of the tab bar, and hidden when the tab is out of it", () => {
    const { bar, tab, moveTab } = setup();
    focusLineLayer().show(tab, owner);
    moveTab(rect(-100, 40, 120, 34)); // line would be -70..-10: out of the bar
    bar.dispatchEvent(new Event("scroll"));
    expect(style().display).toBe("none");
    moveTab(rect(-40, 40, 120, 34)); // line -10..50 → 0..50
    bar.dispatchEvent(new Event("scroll"));
    expect(style().display).not.toBe("none");
    expect(style().left).toBe("0px");
    expect(style().width).toBe("50px");
  });

  test("is removed by its owner, not by another", () => {
    const { tab } = setup();
    const layer = focusLineLayer();
    layer.show(tab, owner);
    layer.hide({});
    expect(layer.target).toBe(tab);
    layer.hide(owner);
    expect(layer.target).toBeNull();
    expect(style().display).toBe("none");
  });
});
