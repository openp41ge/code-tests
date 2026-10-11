/**
 * Guard rail for the package naming convention (AGENTS.md §3): the platform
 * (`packages/openp41ge`), the SDK (`openp41ge-sdk`, `openp41ge-sdk-*`) and the
 * core libraries (`openp41ge-core-*`) never depend on or import an extension
 * (`openp41ge-extension-*`). Extensions are
 * discovered and loaded at runtime, never bundled into the platform.
 *
 * Extension ids may still appear as strings (saved-state migrations, the
 * official catalog); only package dependencies and import specifiers count.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { inApp } from "@code-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const PACKAGES_DIR = path.resolve(APP_HERE, "../../../..");
// Built at runtime so this file never matches its own scan.
const EXTENSION_PREFIX = "openp41ge-" + "extension-";
const SOURCE_FILE = /\.(?:[cm]?ts|[cm]?js)$/;
const SKIPPED_DIRS = new Set(["node_modules", "dist", "test-results", ".vite"]);
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** Import specifiers in `source` that name an extension package. */
function findExtensionImports(source: string): string[] {
  const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
  return [...source.matchAll(specifier)]
    .map((m) => m[1])
    .filter((s) => s.startsWith(EXTENSION_PREFIX));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

/** The platform, the SDK packages and every core library. */
function guardedPackages(): string[] {
  return readdirSync(PACKAGES_DIR)
    .filter(
      (name) =>
        name === "openp41ge" ||
        name === "openp41ge-sdk" ||
        name.startsWith("openp41ge-sdk-") ||
        name.startsWith("openp41ge-core-"),
    )
    .map((name) => path.join(PACKAGES_DIR, name))
    .filter((dir) => existsSync(path.join(dir, "package.json")));
}

describe("findExtensionImports", () => {
  const ext = `${EXTENSION_PREFIX}explorer`;

  it("detects static, side-effect, dynamic and require imports", () => {
    expect(findExtensionImports(`import { x } from "${ext}";`)).toEqual([ext]);
    expect(findExtensionImports(`import "${ext}/renderer";`)).toEqual([`${ext}/renderer`]);
    expect(findExtensionImports(`await import('${ext}')`)).toEqual([ext]);
    expect(findExtensionImports(`require("${ext}")`)).toEqual([ext]);
    expect(findExtensionImports(`export * from "${ext}";`)).toEqual([ext]);
  });

  it("ignores extension ids used as plain strings and other packages", () => {
    expect(findExtensionImports(`const id = "${ext}";`)).toEqual([]);
    expect(findExtensionImports(`import { x } from "openp41ge-sdk";`)).toEqual([]);
  });
});

describe("package boundaries", () => {
  const packages = guardedPackages();

  it("finds the platform, the SDK packages and the core libraries", () => {
    const names = packages.map((dir) => path.basename(dir));
    expect(names).toContain("openp41ge");
    expect(names).toContain("openp41ge-sdk");
    expect(names).toContain("openp41ge-sdk-uikit");
    expect(names.some((n) => n.startsWith("openp41ge-core-"))).toBe(true);
  });

  it("guarded packages never depend on an extension package", () => {
    const violations = packages.flatMap((dir) => {
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
      return DEPENDENCY_FIELDS.flatMap((field) =>
        Object.keys(pkg[field] ?? {})
          .filter((dep) => dep.startsWith(EXTENSION_PREFIX))
          .map((dep) => `${path.basename(dir)} ${field}: ${dep}`),
      );
    });
    expect(violations).toEqual([]);
  });

  it("guarded packages never import an extension package", () => {
    const violations = packages.flatMap((dir) =>
      sourceFiles(dir).flatMap((file) =>
        findExtensionImports(readFileSync(file, "utf8")).map(
          (spec) => `${path.relative(PACKAGES_DIR, file)}: ${spec}`,
        ),
      ),
    );
    expect(violations).toEqual([]);
  });
});
