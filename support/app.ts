/**
 * app.ts — runs this repo's tests against an openp41ge/code checkout.
 *
 * The tests here mirror the app's layout (`packages/<pkg>/test/...`), and
 * were written to sit inside it. `appMirror` keeps them working from here:
 * every import made from a file in this repo resolves as if that file sat at
 * the same path in the app checkout.
 *
 *   - `vitest` / `@vitest/*`: from this repo (the runner's own instance).
 *   - other bare ids (`lit`, `openp41ge-sdk`, …): from the app, so a test and
 *     the source under test share one instance; then from this repo
 *     (test-only dependencies); then from the platform package (workspace
 *     libraries only the tests import).
 *   - relative and absolute ids: from this repo first (helpers, stubs,
 *     fixtures), then from the app (`../../src/...`).
 *
 * The app checkout is `APP_DIR`, else the `code/master` worktree beside
 * this repo's own worktree (`code-tests/master`), or beside this repo when it
 * is a plain clone (`code-tests/`), or an older `app/master`, whichever
 * exists.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { ViteUserConfig } from "vitest/config";

/** This repo's root. */
export const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The app checkout the tests run against. */
export const APP_DIR = resolveAppDir();

function resolveAppDir(): string {
  const isCheckout = (dir: string) => fs.existsSync(path.join(dir, "pnpm-workspace.yaml"));
  if (process.env.APP_DIR) {
    const dir = path.resolve(process.env.APP_DIR);
    if (!isCheckout(dir)) throw new Error(`No openp41ge/code checkout at APP_DIR (${dir}).`);
    return dir;
  }
  const found = ["../../code/master", "../code/master", "../app/master"]
    .map((rel) => path.resolve(TESTS_DIR, rel))
    .find(isCheckout);
  if (!found) {
    throw new Error(
      "No openp41ge/code checkout beside this repo. Set APP_DIR to one (see README.md).",
    );
  }
  return found;
}

/** Where `file` (in this repo) would sit in the app checkout. */
export function inApp(file: string): string {
  return path.join(APP_DIR, path.relative(TESTS_DIR, file));
}

/** The nearest `package.json` at or above `file` in the app checkout. */
function packageOf(file: string): string {
  for (let dir = path.dirname(file); dir.startsWith(APP_DIR); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest)) return manifest;
  }
  return path.join(APP_DIR, "package.json");
}

/** The platform package's manifest: an importer that reaches every workspace library. */
const PLATFORM_MANIFEST = path.join(APP_DIR, "packages/openp41ge/package.json");

const RUNNER = /^(vitest|@vitest\/[^/]+)(\/|$)/;

function isBare(id: string): boolean {
  return (
    !id.startsWith(".") && !path.isAbsolute(id) && !id.startsWith("\0") && !/^[a-z]+:/i.test(id)
  );
}

/** Resolve imports from this repo's files as if they were in the app. */
export function appMirror(): Plugin {
  return {
    name: "openp41ge-app-mirror",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !importer.startsWith(TESTS_DIR + path.sep)) return null;
      if (source.startsWith("\0") || RUNNER.test(source)) return null;
      const mirrored = inApp(importer);
      // Vite searches node_modules only from an importer that exists, and the
      // tests are not in the app: bare ids resolve from the app's nearest
      // package instead.
      const importers = isBare(source) ? [packageOf(mirrored), importer] : [importer, mirrored];
      for (const from of importers) {
        const resolved = await this.resolve(source, from, { ...options, skipSelf: true });
        if (resolved) return resolved;
      }
      // A workspace library only a test imports (the extensions no longer
      // list `openp41ge-core-extension-host`): the platform depends on them.
      return isBare(source)
        ? this.resolve(source, PLATFORM_MANIFEST, { ...options, skipSelf: true })
        : null;
    },
  };
}

/**
 * A package's test project: `configDir` is `packages/<pkg>` in this repo.
 * Adds the mirror, names the project after the package, roots it here (test
 * globs and setup files are this repo's), and gives the tests `APP_DIR`.
 */
export function packageProject(configDir: string, config: ViteUserConfig): ViteUserConfig {
  const name = path.basename(configDir);
  return {
    ...config,
    plugins: [appMirror(), ...(config.plugins ?? [])],
    resolve: {
      ...config.resolve,
      alias: { "@code-tests/support": fileURLToPath(import.meta.url), ...config.resolve?.alias },
    },
    // `?raw` imports (grammars, icons) read files in the app checkout.
    server: { ...config.server, fs: { allow: [TESTS_DIR, APP_DIR] } },
    test: {
      name,
      root: configDir,
      globals: true,
      watch: false,
      ...config.test,
      env: { APP_DIR, ...config.test?.env },
    },
  };
}

/** `packages/<pkg>` in the app checkout, for a config in `packages/<pkg>` here. */
export function appPackage(configDir: string): string {
  return inApp(configDir);
}
