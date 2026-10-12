/**
 * The focus line rule every tab bar's styles must contain (see focus-line.ts):
 * shared by the toolkit's and the platform's focus line tests.
 */
import { expect } from "vitest";

/** The focus line rule for `tab`, as every tab bar's styles must contain it. */
export function expectFocusLine(css: string, tab: string): void {
  const esc = tab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`${esc}\\[data-focused\\]::after\\s*\\{([^}]*)\\}`).exec(css);
  expect(rule, `${tab}[data-focused]::after rule`).not.toBeNull();
  const body = rule![1];
  expect(body).toMatch(/position:\s*absolute/);
  expect(body).toMatch(/top:\s*0/);
  expect(body).toMatch(/left:\s*25%/);
  expect(body).toMatch(/width:\s*50%/);
  expect(body).toMatch(/height:\s*3px/);
  expect(body).toMatch(/border-radius:\s*\dpx/);
  expect(body).toMatch(/background:\s*#4a9eff/);
  expect(css).toMatch(new RegExp(`${esc}\\s*\\{[^}]*position:\\s*relative`));
  expect(css).not.toMatch(/inset 0 2px 0/);
}
