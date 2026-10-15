/**
 * Custom-element registry identity.
 *
 * The openp41ge-sdk-uikit components register themselves into the single global
 * `customElements` registry as a module side effect. Extensions running
 * renderer-driven UI in the same page must share that registry:
 *
 *   - the constructor a module exports must BE the constructor registered in
 *     the platform's registry (identity, not a shadow copy), and
 *   - every `customElements.define` must be guarded by a `customElements.get`
 *     for the same tag, so that a second toolkit copy (e.g. a distribution
 *     bundle that inlined its own uikit) no-ops instead of throwing
 *     `... has already been used with a different constructor`.
 */
import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { Openp41geIcon } from "../../src/components/openp41ge-icon";
import { Openp41geInlineIcon } from "../../src/components/openp41ge-inline-icon";
import { Openp41geToggle } from "../../src/components/openp41ge-toggle";
import { Openp41geSelect } from "../../src/components/openp41ge-select";
import { DropLine } from "../../src/components/drop-indicator/drop-line";
import { APP_DIR } from "@code-tests/support";

const uikitSrc = join(APP_DIR, "packages/openp41ge-sdk-uikit/src");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectTsFiles(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("custom element registry identity", () => {
  test("module class is the registered custom element (shared registry)", () => {
    // Importing a component registers it; the class it exports must be the
    // exact constructor in the platform's single customElements registry.
    expect(customElements.get("openp41ge-icon")).toBe(Openp41geIcon);
    expect(customElements.get("openp41ge-inline-icon")).toBe(Openp41geInlineIcon);
    expect(customElements.get("openp41ge-toggle")).toBe(Openp41geToggle);
    expect(customElements.get("openp41ge-select")).toBe(Openp41geSelect);
    expect(customElements.get("drop-line")).toBe(DropLine);
  });

  test("every customElements.define is guarded by customElements.get for the same tag", () => {
    // Multi-copy safety invariant: a second toolkit copy must no-op rather
    // than throw a duplicate-definition error. Each `define` must be gated by
    // a `get` guard for the identical tag within the same module.
    let checked = 0;
    for (const file of collectTsFiles(uikitSrc)) {
      const src = readFileSync(file, "utf8");
      const defined = [...src.matchAll(/customElements\.define\(\s*["'`]([^"'`]+)["'`]/g)].map(
        (m) => m[1],
      );
      if (defined.length === 0) continue;
      const guarded = new Set(
        [...src.matchAll(/customElements\.get\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]),
      );
      for (const tag of defined) {
        expect(
          guarded.has(tag),
          `un-guarded customElements.define("${tag}") in ${relative(uikitSrc, file)}`,
        ).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
