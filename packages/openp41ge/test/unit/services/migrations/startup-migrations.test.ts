/**
 * planStartupMigrations: what startup does about data migrations — nothing,
 * run these sets (in the migration window), the window's offline state, or
 * start without them for now.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { planStartupMigrations } from "@openp41ge/main/services/migrations/startup-migrations";
import {
  applyMigration,
  readDataVersion,
  writeDataVersion,
  readJournal,
} from "@openp41ge/main/services/migrations/pending-migrations";

let root: string;
const set = (id: string) => ({ id, raw: { id, description: id, release: "0.2.0", steps: [] } });
const withData = () => {
  fs.mkdirSync(path.join(root, "workspaces"), { recursive: true });
  fs.writeFileSync(path.join(root, "workspaces", "w.openp41ge-workspace"), "{}");
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "startup-migrations-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const release = (
  download: () => Promise<{ ok: boolean; sets: ReturnType<typeof set>[]; error?: string }>,
  required: string[] = [],
) => ({
  root,
  version: "0.2.0",
  packaged: true,
  download: vi.fn(download),
  required,
});

describe("planStartupMigrations — release builds", () => {
  it("does nothing, and downloads nothing, for a fresh install", async () => {
    const deps = release(async () => ({ ok: true, sets: [] }));
    await expect(planStartupMigrations(deps)).resolves.toEqual({ kind: "none" });
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("runs the downloaded sets not yet applied", async () => {
    withData();
    writeDataVersion(root, "0.1.0");
    const deps = release(async () => ({ ok: true, sets: [set("a"), set("b")] }));
    applyMigration(root, set("a"));
    const plan = await planStartupMigrations(deps);
    expect(plan).toMatchObject({ kind: "run" });
    expect(plan.kind === "run" && plan.sets.map((s) => s.id)).toEqual(["b"]);
    expect(deps.download).toHaveBeenCalledWith("0.1.0", "0.2.0");
  });

  it("records the version when every downloaded set is already applied", async () => {
    withData();
    writeDataVersion(root, "0.1.0");
    applyMigration(root, set("a"));
    await expect(
      planStartupMigrations(release(async () => ({ ok: true, sets: [set("a")] }))),
    ).resolves.toEqual({
      kind: "none",
    });
    expect(readDataVersion(root)).toBe("0.2.0");
  });

  it("refuses to start when the download lacks a required set (never opens on the old layout)", async () => {
    withData();
    writeDataVersion(root, "0.1.0");
    const deps = release(async () => ({ ok: true, sets: [set("b")] }), ["a", "b"]);
    const plan = await planStartupMigrations(deps);
    expect(plan).toMatchObject({ kind: "offline" });
    expect(plan.kind === "offline" && plan.error).toMatch(/\ba\b/);
    expect(readDataVersion(root)).toBe("0.1.0");
  });

  it("offline with a required set missing: the window's offline state", async () => {
    withData();
    const deps = release(async () => ({ ok: false, sets: [], error: "ENOTFOUND" }), ["a"]);
    await expect(planStartupMigrations(deps)).resolves.toEqual({
      kind: "offline",
      error: "ENOTFOUND",
    });
  });

  it("offline with every required set applied: starts, and tries again next time", async () => {
    withData();
    applyMigration(root, set("a"));
    const deps = release(async () => ({ ok: false, sets: [], error: "ENOTFOUND" }), ["a"]);
    await expect(planStartupMigrations(deps)).resolves.toEqual({ kind: "deferred" });
    expect(readDataVersion(root)).toBeUndefined();
  });
});

describe("planStartupMigrations — never on data it cannot read", () => {
  it("refuses data last used by a newer version, without downloading", async () => {
    withData();
    writeDataVersion(root, "0.3.0");
    const deps = release(async () => ({ ok: true, sets: [] }));
    await expect(planStartupMigrations(deps)).resolves.toEqual({
      kind: "newer",
      dataVersion: "0.3.0",
    });
    expect(deps.download).not.toHaveBeenCalled();
    expect(readDataVersion(root)).toBe("0.3.0");
  });

  it("opens data at the same version", async () => {
    withData();
    writeDataVersion(root, "0.2.0");
    await expect(
      planStartupMigrations(release(async () => ({ ok: true, sets: [] }))),
    ).resolves.toEqual({
      kind: "none",
    });
  });

  it("turns an unexpected failure of the check into an error, not an open app", async () => {
    withData();
    const deps = release(async () => {
      throw new Error("boom");
    });
    await expect(planStartupMigrations(deps)).resolves.toEqual({ kind: "error", error: "boom" });
  });
});

describe("planStartupMigrations — dev builds", () => {
  it("runs the pending sets of the local folder, without downloading", async () => {
    const download = vi.fn();
    const plan = await planStartupMigrations({
      root,
      version: "0.0.0-dev",
      packaged: false,
      localSets: () => [set("a")],
      download,
      required: [],
    });
    expect(plan.kind === "run" && plan.sets.map((s) => s.id)).toEqual(["a"]);
    expect(download).not.toHaveBeenCalled();
  });
});
