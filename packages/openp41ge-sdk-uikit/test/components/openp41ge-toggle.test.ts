// @ts-nocheck
/**
 * <openp41ge-toggle>: noTab takes its (hidden) checkbox out of the tab order;
 * a click still toggles it.
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../src/components/openp41ge-toggle";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("openp41ge-toggle", () => {
  it("is in the tab order by default", async () => {
    const el = document.createElement("openp41ge-toggle");
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector("input").tabIndex).toBe(0);
  });

  it("noTab: out of the tab order; a click still toggles", async () => {
    const el = document.createElement("openp41ge-toggle");
    el.noTab = true;
    const changes = [];
    el.addEventListener("change", (e) => changes.push(e.detail.checked));
    document.body.appendChild(el);
    await el.updateComplete;
    const input = el.shadowRoot.querySelector("input");
    expect(input.tabIndex).toBe(-1);
    input.click();
    expect(changes).toEqual([true]);
  });
});
