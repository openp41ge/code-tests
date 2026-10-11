/**
 * Unit tests for extension discovery on disk.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverExtensions } from "@openp41ge-core-extension-host/discovery";

let root: string;

const validManifest = (name: string, id: string, entry = "./dist/index.js") =>
  JSON.stringify({
    name,
    version: "1.0.0",
    openp41ge: { extension: true, id, publisher: "openp41ge", entry },
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ext-discovery-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("discoverExtensions", () => {
  it("discovers subdirs with a valid manifest and resolves the entry path", async () => {
    await mkdir(join(root, "openp41ge-terminal"));
    await writeFile(
      join(root, "openp41ge-terminal", "package.json"),
      validManifest("openp41ge-extension-terminal", "openp41ge-terminal"),
    );

    const found = await discoverExtensions([root]);
    expect(found).toHaveLength(1);
    expect(found[0].manifest.openp41ge.id).toBe("openp41ge-terminal");
    expect(found[0].root).toBe(join(root, "openp41ge-terminal"));
    expect(found[0].entryPath).toBe(join(root, "openp41ge-terminal", "dist", "index.js"));
  });

  it("skips dirs without a manifest, invalid manifests, and hidden dirs", async () => {
    await mkdir(join(root, "no-manifest"));
    await writeFile(join(root, "no-manifest", "readme.txt"), "hi");

    await mkdir(join(root, "bad-manifest"));
    await writeFile(join(root, "bad-manifest", "package.json"), JSON.stringify({ name: "x" }));

    await mkdir(join(root, ".hidden"));
    await writeFile(join(root, ".hidden", "package.json"), validManifest("h", "h"));

    await mkdir(join(root, "good"));
    await writeFile(join(root, "good", "package.json"), validManifest("g", "g"));

    const found = await discoverExtensions([root]);
    expect(found.map((f) => f.manifest.openp41ge.id).sort()).toEqual(["g"]);
  });

  it("does not throw for missing or unreadable discovery dirs", async () => {
    const found = await discoverExtensions([join(root, "missing")]);
    expect(found).toEqual([]);
  });

  it("aggregates across multiple discovery dirs", async () => {
    const a = join(root, "a");
    const b = join(root, "b");
    await mkdir(join(a, "one"), { recursive: true });
    await writeFile(join(a, "one", "package.json"), validManifest("one", "one"));
    await mkdir(join(b, "two"), { recursive: true });
    await writeFile(join(b, "two", "package.json"), validManifest("two", "two"));

    const found = await discoverExtensions([a, b]);
    expect(found.map((f) => f.manifest.openp41ge.id).sort()).toEqual(["one", "two"]);
  });
});
