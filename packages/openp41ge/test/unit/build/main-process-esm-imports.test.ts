/**
 * The main process (electron/, src/main, src/layout) runs as native ESM in
 * Node, which needs the file extension on relative imports ("./x.js"). Vite
 * and vitest resolve "./x" anyway, so a missing extension only fails when the
 * app starts. This guards it. `import type` is erased at build, so exempt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { inApp } from "@app-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const ROOT = path.resolve(APP_HERE, "../../..");
const DIRS = ["electron", "src/main", "src/layout"];

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return tsFiles(full);
    return /\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name) ? [full] : [];
  });
}

/** Relative value-import specifiers in `source` that lack a file extension. */
function extensionlessRelativeImports(source: string): string[] {
  const found: string[] = [];
  const re = /^\s*(import|export)\s+(?!type\b)[^;]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']/gm;
  for (const m of source.matchAll(re)) {
    if (!/\.(c|m)?js$|\.json$/.test(m[2])) found.push(m[2]);
  }
  for (const m of source.matchAll(/^\s*import\s*["'](\.{1,2}\/[^"']+)["']/gm)) {
    if (!/\.(c|m)?js$|\.json$|\.css$/.test(m[1])) found.push(m[1]);
  }
  return found;
}

describe("main-process ESM imports", () => {
  it("flags extensionless relative imports but not type-only ones", () => {
    expect(extensionlessRelativeImports(`import { a } from "./a";`)).toEqual(["./a"]);
    expect(extensionlessRelativeImports(`import { a } from "./a.js";`)).toEqual([]);
    expect(extensionlessRelativeImports(`import type { A } from "./a";`)).toEqual([]);
    expect(extensionlessRelativeImports(`export { a } from "../a";`)).toEqual(["../a"]);
    expect(extensionlessRelativeImports(`import {\n  a,\n  b,\n} from "./ab";`)).toEqual(["./ab"]);
  });

  it("every relative import in main-process code has a file extension", () => {
    const violations = DIRS.flatMap((d) =>
      tsFiles(path.join(ROOT, d)).flatMap((file) =>
        extensionlessRelativeImports(readFileSync(file, "utf8")).map(
          (spec) => `${path.relative(ROOT, file)}: ${spec}`,
        ),
      ),
    );
    expect(violations).toEqual([]);
  });
});
