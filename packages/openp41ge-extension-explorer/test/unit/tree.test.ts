/**
 * Unit tests for the Explorer extension's directory-listing logic.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDir } from "@openp41ge-extension-explorer/tree";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ext-explorer-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("listDir", () => {
  it("lists children dirs-first then by name, skipping dot-entries", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "z.txt"), "z");
    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, ".gitignore"), "node_modules");

    const nodes = await listDir(root);
    expect(nodes.map((n) => n.name)).toEqual(["src", "a.txt", "z.txt"]);
    expect(nodes[0].kind).toBe("dir");
    expect(nodes.find((n) => n.name === "a.txt")?.kind).toBe("file");
  });

  it("strips dot-prefixed entries entirely", async () => {
    await writeFile(join(root, ".hidden"), "h");
    expect(await listDir(root)).toEqual([]);
  });

  it("returns absolute child paths", async () => {
    await writeFile(join(root, "b.txt"), "b");
    const nodes = await listDir(root);
    expect(nodes[0].path).toBe(join(root, "b.txt"));
  });

  it("throws when the directory does not exist", async () => {
    await expect(listDir(join(root, "nope"))).rejects.toThrow();
  });

  it("throws when the path is a file, not a directory", async () => {
    const file = join(root, "f.txt");
    await writeFile(file, "x");
    await expect(listDir(file)).rejects.toThrow();
  });

  it("prefetches nested subdirectory listings up to the requested depth", async () => {
    await mkdir(join(root, "src", "components", "ui"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export {}");
    await writeFile(join(root, "src", "components", "ui", "button.ts"), "export {}");

    const nodes = await listDir(root, 3);
    const src = nodes.find((n) => n.name === "src")!;
    expect(src.kind).toBe("dir");
    expect(src.children).toBeDefined();

    const components = src.children!.find((n) => n.name === "components")!;
    expect(components.children).toBeDefined();

    const ui = components.children!.find((n) => n.name === "ui")!;
    expect(ui.kind).toBe("dir");
    expect(ui.children).toBeDefined();
    expect(ui.children!.map((n) => n.name)).toContain("button.ts");

    // Files are never expanded, so they carry no children.
    const index = src.children!.find((n) => n.name === "index.ts")!;
    expect(index.children).toBeUndefined();
  });

  it("depth 2 prefetches exactly two nested levels below the directory", async () => {
    await mkdir(join(root, "a", "b", "c"), { recursive: true });
    const nodes = await listDir(root, 2);
    const a = nodes.find((n) => n.name === "a")!;
    const b = a.children!.find((n) => n.name === "b")!;
    // a.children and b.children are prefetched; c (the third level) is not.
    expect(b.children).toBeDefined();
    const c = b.children!.find((n) => n.name === "c")!;
    expect(c.children).toBeUndefined();
  });

  it("depth 0 returns flat listings with no nested children", async () => {
    await mkdir(join(root, "a"));
    await mkdir(join(root, "a", "b"));
    const nodes = await listDir(root);
    const a = nodes.find((n) => n.name === "a")!;
    expect(a.children).toBeUndefined();
  });
});
