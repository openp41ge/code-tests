// @vitest-environment node
/**
 * scripts/bundle-extensions.ts (the release build): each official extension
 * becomes a self-contained extension dir that a packaged app — which has no
 * node_modules — can load. The backend inlines everything but Node builtins;
 * the renderer imports nothing but the shared extension runtime.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { ExtensionHost, discoverExtensions } from "openp41ge-core-extension-host";
import { createNoopLogger } from "openp41ge-core-logger";
import { RUNTIME_SPECIFIERS } from "../../../vite.extension-runtime";
import { bundleExtension, officialExtensionDirs } from "../../../scripts/bundle-extensions";
import { inApp } from "@code-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const PACKAGES = path.resolve(APP_HERE, "../../../..");
let out: string;

/** Bare (non-relative) import specifiers of an ES module's source. */
function bareImports(source: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"'.][^"']*)["']/gm,
    /^\s*import\s*["']([^"'.][^"']*)["']/gm,
    /\bimport\(\s*["']([^"'.][^"']*)["']\s*\)/g,
  ];
  for (const pattern of patterns) for (const m of source.matchAll(pattern)) found.add(m[1]);
  return [...found];
}

const isBuiltin = (s: string) =>
  s.startsWith("node:") || ["fs", "path", "os", "child_process", "module"].includes(s);

beforeAll(async () => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-extensions-"));
  for (const dir of officialExtensionDirs(PACKAGES)) await bundleExtension(dir, out);
}, 120_000);
afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

describe("bundle-extensions", () => {
  it("finds the official extensions in the repo's packages", () => {
    const ids = officialExtensionDirs(PACKAGES).map((d) => path.basename(d));
    expect(ids).toEqual(
      expect.arrayContaining([
        "openp41ge-extension-agents",
        "openp41ge-extension-explorer",
        "openp41ge-extension-git",
        "openp41ge-extension-workspaces",
      ]),
    );
  });

  it("writes each as a discoverable extension: manifest + both entries", async () => {
    const found = await discoverExtensions([out]);
    expect(found.map((d) => d.manifest.openp41ge.id).sort()).toEqual(
      officialExtensionDirs(PACKAGES)
        .map((d) => path.basename(d))
        .sort(),
    );
    for (const d of found) {
      expect(fs.existsSync(d.entryPath)).toBe(true);
      expect(fs.existsSync(path.join(d.root, d.manifest.openp41ge.renderer!))).toBe(true);
    }
  });

  it("bundles backends that import only Node builtins", async () => {
    for (const d of await discoverExtensions([out])) {
      const imports = bareImports(fs.readFileSync(d.entryPath, "utf-8"));
      expect(
        imports.filter((s) => !isBuiltin(s)),
        d.manifest.openp41ge.id,
      ).toEqual([]);
    }
  });

  it("bundles renderers that import only the shared extension runtime", async () => {
    for (const d of await discoverExtensions([out])) {
      const source = fs.readFileSync(path.join(d.root, d.manifest.openp41ge.renderer!), "utf-8");
      const outside = bareImports(source).filter((s) => !RUNTIME_SPECIFIERS.includes(s));
      expect(outside, d.manifest.openp41ge.id).toEqual([]);
    }
  });

  it("loads every bundled backend in a host, outside the repo's node_modules", async () => {
    const host = new ExtensionHost({ discoveryDirs: [out], createLogger: createNoopLogger });
    const loaded = await host.loadAll();
    for (const ext of loaded) expect(ext.error, ext.id).toBeUndefined();
    expect(loaded.every((ext) => ext.active)).toBe(true);
    await host.deactivateAll();
  });
});
