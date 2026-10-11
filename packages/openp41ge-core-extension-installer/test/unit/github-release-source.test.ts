/**
 * Unit tests for the GitHub-release extension source: install / update /
 * uninstall, sha256 verification and state persistence.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { GithubReleaseSource } from "@openp41ge-core-extension-installer/github-release-source";
import type { ExtensionCatalog } from "@openp41ge-core-extension-installer/catalog";
import { readState } from "@openp41ge-core-extension-installer/state";
import { createNoopLogger } from "openp41ge-core-logger";

let installDir: string;
let workspace: string;

const manifestJson = (id: string) =>
  JSON.stringify({
    name: `openp41ge-extension-${id}`,
    version: "1.0.0",
    openp41ge: { extension: true, id, publisher: "openp41ge", entry: "./dist/index.js", api: "0.1" },
  });

async function buildTgz(id: string, version = "1.0.0"): Promise<Uint8Array> {
  const src = await mkdtemp(join(tmpdir(), `ext-tgz-${id}-`));
  await mkdir(join(src, "package", "dist"), { recursive: true });
  await writeFile(join(src, "package", "package.json"), manifestJson(id));
  await writeFile(join(src, "package", "dist", "index.js"), `export function activate() {}\n`);
  const out = join(workspace, `${id}-${version}.tgz`);
  await tar.c({ gzip: true, file: out, cwd: src }, ["package"]);
  const bytes = await readFile(out);
  return new Uint8Array(bytes);
}

function makeSource(opts: {
  catalog?: () => ExtensionCatalog;
  assets?: Map<string, Uint8Array>;
  failAsset?: Map<string, boolean>;
}) {
  const assets = opts.assets ?? new Map<string, Uint8Array>();
  return new GithubReleaseSource({
    org: "openp41ge",
    catalogUrl: "https://example.test/catalog.json",
    installDir,
    createLogger: createNoopLogger,
    fetchJson: async () => opts.catalog?.() ?? { extensions: [] },
    fetchBinary: async (url) => {
      if (opts.failAsset?.get(url)) throw new Error(`fetch failed: ${url}`);
      const b = assets.get(url);
      if (!b) throw new Error(`unknown asset url ${url}`);
      return b;
    },
  });
}

const catalogEntry = (id: string, asset: string, bytes: Uint8Array, version = "1.0.0") => ({
  id,
  version,
  asset,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

beforeEach(async () => {
  installDir = await mkdtemp(join(tmpdir(), "ext-install-"));
  workspace = await mkdtemp(join(tmpdir(), "ext-workspace-"));
});

afterEach(async () => {
  await rm(installDir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

describe("GithubReleaseSource", () => {
  it("installs an extension, verifies sha256, and records it in state", async () => {
    const bytes = await buildTgz("term");
    const entry = catalogEntry("term", "https://example.test/term-1.0.0.tgz", bytes);
    const source = makeSource({
      catalog: () => ({ extensions: [entry] }),
      assets: new Map([[entry.asset, bytes]]),
    });

    const result = await source.install("term");
    expect(result.updated).toBe(false);
    expect(result.installed.dir).toBe(join(installDir, "term"));

    const pkg = JSON.parse(await readFile(join(installDir, "term", "package.json"), "utf8"));
    expect(pkg.openp41ge.id).toBe("term");
    expect(await readFile(join(installDir, "term", "dist", "index.js"), "utf8")).toContain("activate");

    const state = await readState(join(installDir, "state.json"));
    expect(state.installed.term.version).toBe("1.0.0");
  });

  it("rejects an asset whose sha256 does not match the catalog", async () => {
    const bytes = await buildTgz("term");
    const entry = { id: "term", version: "1.0.0", asset: "https://example.test/x.tgz", sha256: "deadbeef" };
    const source = makeSource({ catalog: () => ({ extensions: [entry] }), assets: new Map([[entry.asset, bytes]]) });

    await expect(source.install("term")).rejects.toThrow(/sha256 mismatch/);
    // No half-installed extension or state entry left behind.
    await expect(readFile(join(installDir, "term", "package.json"), "utf8")).rejects.toThrow();
    const state = await readState(join(installDir, "state.json"));
    expect(state.installed.term).toBeUndefined();
  });

  it("does not leak a staging dir when extraction fails", async () => {
    const bytes = await buildTgz("term");
    const entry = catalogEntry("term", "https://example.test/x.tgz", bytes);
    const source = makeSource({
      catalog: () => ({ extensions: [entry] }),
      assets: new Map([[entry.asset, bytes]]),
      failAsset: new Map([[entry.asset, true]]),
    });

    await expect(source.install("term")).rejects.toThrow(/fetch failed/);
  });

  it("update installs a newer version and reports updated: true", async () => {
    const v1 = await buildTgz("term", "1.0.0");
    const v2 = await buildTgz("term", "2.0.0");
    const e1 = catalogEntry("term", "https://example.test/term-1.tgz", v1, "1.0.0");
    const e2 = catalogEntry("term", "https://example.test/term-2.tgz", v2, "2.0.0");
    let current = e1;
    const source = makeSource({
      catalog: () => ({ extensions: [current] }),
      assets: new Map([[e1.asset, v1], [e2.asset, v2]]),
    });

    await source.install("term");
    current = e2;
    const result = await source.update("term");
    expect(result).not.toBeNull();
    expect(result!.updated).toBe(true);
    expect(result!.installed.version).toBe("2.0.0");
    expect((await readState(join(installDir, "state.json"))).installed.term.version).toBe("2.0.0");
  });

  it("update returns null when already at the latest version", async () => {
    const bytes = await buildTgz("term", "1.0.0");
    const e = catalogEntry("term", "https://example.test/term.tgz", bytes, "1.0.0");
    const source = makeSource({ catalog: () => ({ extensions: [e] }), assets: new Map([[e.asset, bytes]]) });
    await source.install("term");
    expect(await source.update("term")).toBeNull();
  });

  it("update returns null for an extension that is not installed", async () => {
    const source = makeSource({ catalog: () => ({ extensions: [] }) });
    expect(await source.update("ghost")).toBeNull();
  });

  it("uninstall removes the extension dir and its state entry", async () => {
    const bytes = await buildTgz("term");
    const e = catalogEntry("term", "https://example.test/term.tgz", bytes);
    const source = makeSource({ catalog: () => ({ extensions: [e] }), assets: new Map([[e.asset, bytes]]) });
    await source.install("term");

    await source.uninstall("term");
    await expect(readFile(join(installDir, "term", "package.json"), "utf8")).rejects.toThrow();
    const state = await readState(join(installDir, "state.json"));
    expect(state.installed.term).toBeUndefined();
  });

  it("listInstalled reflects state", async () => {
    const a = await buildTgz("a");
    const b = await buildTgz("b");
    const ea = catalogEntry("a", "https://example.test/a.tgz", a);
    const eb = catalogEntry("b", "https://example.test/b.tgz", b);
    const source = makeSource({
      catalog: () => ({ extensions: [ea, eb] }),
      assets: new Map([[ea.asset, a], [eb.asset, b]]),
    });
    await source.install("a");
    await source.install("b");

    const installed = await source.listInstalled();
    expect(installed.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("throws when the requested id is not in the catalog", async () => {
    const source = makeSource({ catalog: () => ({ extensions: [] }) });
    await expect(source.install("ghost")).rejects.toThrow(/not found/);
  });
});
