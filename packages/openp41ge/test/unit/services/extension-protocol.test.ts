/**
 * Unit tests for the extension asset protocol resolver (main process).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveExtensionAsset } from "@openp41ge/main/services/extension-protocol";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "ext-proto-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("resolveExtensionAsset", () => {
  it("serves a file from the extension root with the right mime", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ext-a-"));
    await writeFile(join(dir, "renderer.js"), "export const x = 1;");
    const result = await resolveExtensionAsset(
      "openp41ge-ext://ext-a/renderer.js",
      [{ id: "ext-a", root: dir }],
    );
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/javascript");
    expect(result.body?.toString()).toBe("export const x = 1;");
    await rm(dir, { recursive: true, force: true });
  });

  it("ignores a cache-busting query string when resolving a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ext-a-"));
    await writeFile(join(dir, "renderer.js"), "export const x = 1;");
    const result = await resolveExtensionAsset(
      "openp41ge-ext://ext-a/renderer.js?e=7",
      [{ id: "ext-a", root: dir }],
    );
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/javascript");
    expect(result.body?.toString()).toBe("export const x = 1;");
    await rm(dir, { recursive: true, force: true });
  });

  it("returns 404 for an unknown extension id", async () => {
    const result = await resolveExtensionAsset(
      "openp41ge-ext://nope/renderer.js",
      [{ id: "ext-a", root: rootDir }],
    );
    expect(result.status).toBe(404);
  });

  it("returns 403 for a raw path that escapes the extension root", async () => {
    const result = await resolveExtensionAsset(
      "openp41ge-ext://ext-a/../../etc/passwd",
      [{ id: "ext-a", root: rootDir }],
    );
    expect(result.status).toBe(403);
  });

  it("returns 404 for a missing file within the root", async () => {
    const result = await resolveExtensionAsset(
      "openp41ge-ext://ext-a/missing.js",
      [{ id: "ext-a", root: rootDir }],
    );
    expect(result.status).toBe(404);
  });

  it("returns 403 for a root request without a file", async () => {
    const result = await resolveExtensionAsset(
      "openp41ge-ext://ext-a/",
      [{ id: "ext-a", root: rootDir }],
    );
    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed url", async () => {
    const result = await resolveExtensionAsset("not a url", [{ id: "ext-a", root: rootDir }]);
    expect(result.status).toBe(400);
  });

  it("serves files inside a nested directory", async () => {
    const dir = join(rootDir, "dist");
    await mkdir(dir);
    await writeFile(join(dir, "index.js"), "// nested");
    const result = await resolveExtensionAsset(
      "openp41ge-ext://ext-a/dist/index.js",
      [{ id: "ext-a", root: rootDir }],
    );
    expect(result.status).toBe(200);
    expect(result.body?.toString()).toBe("// nested");
  });
});
