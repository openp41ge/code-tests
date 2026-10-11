/**
 * Unit tests for the drop-indicator family: <drop-line>, <drag-line> and
 * <drop-box>. These are style-driven hosts, so the tests pin the attribute
 * defaults / reflections and the styles the components install into their
 * shadow roots (jsdom does not compute shadow styles for the host element, so
 * we assert on the `<style>` text rather than `getComputedStyle`).
 */
import { describe, test, expect, beforeEach } from "vitest";
import { DropLine } from "../../src/components/drop-indicator/drop-line";
import { DragLine } from "../../src/components/drop-indicator/drag-line";
import { DropBox, type DropFadeDirection } from "../../src/components/drop-indicator/drop-box";
import { DROP_INDICATOR_COLOR, DROP_LINE_GLOW } from "../../src/components/drop-indicator/color";

function styleOf(el: HTMLElement): string {
  const style = el.shadowRoot?.querySelector("style");
  if (!style) return "";
  return style.textContent ?? "";
}

describe("drop-line", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drop-line>", () => {
    expect(customElements.get("drop-line")).toBe(DropLine);
  });

  test("defaults to the solid blue drop color and a vertical orientation", async () => {
    const el = new DropLine();
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.orientation).toBe("vertical");
    expect(el.getAttribute("orientation")).toBe("vertical");
    const css = styleOf(el);
    expect(css).toContain("--drop-color: rgb(74, 158, 255)");
    expect(css).toContain("background: var(--drop-color)");
  });

  test("reflecting horizontal flips geometry", async () => {
    const el = new DropLine();
    el.orientation = "horizontal";
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute("orientation")).toBe("horizontal");
    const css = styleOf(el);
    expect(css).toContain('[orientation="horizontal"]');
    expect(css).toContain("width: 100%");
    expect(css).toContain("height: var(--drop-width)");
  });

  test("exposes the shared color/glow constants", () => {
    expect(DROP_INDICATOR_COLOR).toBe("rgb(74, 158, 255)");
    expect(DROP_LINE_GLOW).toContain("74, 158, 255");
  });
});

describe("drag-line", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drag-line>", () => {
    expect(customElements.get("drag-line")).toBe(DragLine);
  });

  test("is opaque blue, hidden by default, and shown by the show attribute", async () => {
    const el = new DragLine();
    document.body.appendChild(el);
    await el.updateComplete;
    const css = styleOf(el);
    // Opaque (not translucent) so the line renders identically whatever
    // background it crosses.
    expect(css).toContain("--drop-color: rgb(74, 158, 255)");
    expect(css).toContain("opacity: 0");
    expect(css).toContain(":host([show])");
    expect(el.hasAttribute("show")).toBe(false);

    el.show = true;
    await el.updateComplete;
    expect(el.hasAttribute("show")).toBe(true);
  });

  test("paints itself fully opaque", async () => {
    // The host draws the blue line itself (no companion overdraw element), so
    // it must be opaque and coloured when shown.
    const el = new DragLine();
    document.body.appendChild(el);
    await el.updateComplete;
    const css = styleOf(el);
    expect(css).toContain("background: var(--drop-color)");
    expect(css).toContain("opacity: 0");
  });
});

describe("drop-box", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drop-box>", () => {
    expect(customElements.get("drop-box")).toBe(DropBox);
  });

  test("has a blue border (inset ring), a transparent default, and the wash on by default", async () => {
    const el = new DropBox();
    document.body.appendChild(el);
    await el.updateComplete;
    const css = styleOf(el);
    expect(css).toContain("--drop-color: rgb(74, 158, 255)");
    expect(css).toContain("--drop-wash: rgba(74, 158, 255, 0.2)");
    expect(css).toContain(":host([wash])");
    // The border is an inset box-shadow ring (the app's global `border-width:
    // 0` reset overrides a shadow-root :host border, so a real border would
    // compute to 0). Pin that here so it never regresses to `border:`.
    expect(css).toContain("inset 0 0 0 var(--drop-border) var(--drop-color)");
    expect(css).not.toContain("border: var(--drop-border)");
    // The drop indicator has sharp (square) corners — no border radius.
    expect(css).toContain("--drop-radius: 0px");
    expect(el.hasAttribute("wash")).toBe(true);
  });

  test("fade direction reflects and drives a directional mask", async () => {
    const el = new DropBox();
    el.fade = "right";
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute("fade")).toBe("right");
    const css = styleOf(el);
    expect(css).toContain('[fade="right"]');
    expect(css).toContain("linear-gradient(to right");

    el.wash = false;
    await el.updateComplete;
    expect(el.hasAttribute("wash")).toBe(false);
  });

  test("DropFadeDirection type is a literal union", () => {
    const d: DropFadeDirection = "left";
    expect(["none", "left", "right"]).toContain(d);
  });

  test("frame=false strips the border ring + glow (wash-only box)", async () => {
    const el = new DropBox();
    document.body.appendChild(el);
    await el.updateComplete;
    // Bordered by default (border ring + glow via the inset box-shadow).
    expect(el.hasAttribute("frame")).toBe(true);

    el.frame = false;
    await el.updateComplete;
    expect(el.hasAttribute("frame")).toBe(false);
    const css = styleOf(el);
    // The wash-only variant keeps the wash but drops the ring + glow so the
    // tab bar's insert line reads clearly under the drop box.
    expect(css).toContain(":host(:not([frame]))");
    expect(css).toContain("box-shadow: none");
  });
});
