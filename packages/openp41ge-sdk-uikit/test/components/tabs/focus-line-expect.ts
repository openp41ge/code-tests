/**
 * Where the focus line is (see focus-line.ts): shared by the toolkit's and
 * the platform's focus line tests. The line is one element per document,
 * drawn over the focused tab.
 */
import { expect } from "vitest";
import { focusLineLayer } from "../../../src/components/tabs/focus-line";

/** The focus line is over `tab` (where it is drawn, from the tab's rect, is
 *  covered by focus-line.test.ts; jsdom lays nothing out). */
export function expectFocusLineOn(tab: Element | null): void {
  expect(tab, "the focused tab").not.toBeNull();
  expect(focusLineLayer().target).toBe(tab);
}

/** No focus line is shown. */
export function expectNoFocusLine(): void {
  const layer = focusLineLayer();
  expect(layer.target).toBeNull();
  expect(layer.element.style.display).toBe("none");
}
