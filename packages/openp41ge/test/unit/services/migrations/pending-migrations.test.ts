/**
 * runPendingMigrations: runs the instruction sets the journal has not
 * recorded as applied, in id order, and records each result; a failure stops
 * the run (later sets may depend on it) and is retried next time.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  applyMigration,
  readDataVersion,
  writeDataVersion,
  migrationRange,
  pendingMigrations,
  readJournal,
  readSetsFromFolder,
  runPendingMigrations,
} from "@openp41ge/main/services/migrations/pending-migrations";

let root: string;
let setsDir: string;

function writeSet(id: string, steps: unknown[]): void {
  fs.writeFileSync(
    path.join(setsDir, `${id}.json`),
    JSON.stringify({ id, description: id, release: "0.1.0", steps }),
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pending-migrations-"));
  setsDir = path.join(root, "sets");
  fs.mkdirSync(setsDir);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const data = (...p: string[]) => path.join(root, "data", ...p);
const runNow = () => {
  fs.mkdirSync(data(), { recursive: true });
  return runPendingMigrations({ root: data(), sets: readSetsFromFolder(setsDir) });
};

describe("runPendingMigrations", () => {
  it("runs each set once, in id order, and records it", () => {
    writeSet("2026-02-b", [{ op: "move", from: "a", to: "b" }]);
    writeSet("2026-01-a", [{ op: "mkdir", path: "a" }]);
    expect(runNow()).toEqual({ applied: ["2026-01-a", "2026-02-b"] });
    expect(fs.existsSync(data("b"))).toBe(true);
    expect(readJournal(data()).applied.map((a) => a.id)).toEqual(["2026-01-a", "2026-02-b"]);
    expect(runNow()).toEqual({ applied: [] });
  });

  it("stops at a failing set, records it, and retries it next time", () => {
    writeSet("2026-01-a", [{ op: "move", from: "missing", to: "x" }]);
    writeSet("2026-02-b", [{ op: "mkdir", path: "later" }]);
    const first = runNow();
    expect(first.applied).toEqual([]);
    expect(first.failed).toMatchObject({
      id: "2026-01-a",
      error: expect.stringMatching(/does not exist/),
    });
    expect(fs.existsSync(data("later"))).toBe(false);
    expect(readJournal(data()).failed?.id).toBe("2026-01-a");

    fs.mkdirSync(data("missing"));
    expect(runNow()).toEqual({ applied: ["2026-01-a", "2026-02-b"] });
    expect(readJournal(data()).failed).toBeUndefined();
  });

  it("refuses a set that does not check, and runs nothing after it", () => {
    fs.writeFileSync(
      path.join(setsDir, "2026-01-bad.json"),
      JSON.stringify({
        id: "2026-01-bad",
        description: "x",
        release: "0.1.0",
        steps: [{ op: "exec" }],
      }),
    );
    writeSet("2026-02-b", [{ op: "mkdir", path: "later" }]);
    const result = runNow();
    expect(result.failed).toMatchObject({
      id: "2026-01-bad",
      error: expect.stringMatching(/unknown operation/),
    });
    expect(fs.existsSync(data("later"))).toBe(false);
  });
});

describe("pendingMigrations / applyMigration", () => {
  it("lists what is left in id order, and applying one records it", () => {
    writeSet("2026-02-b", [{ op: "mkdir", path: "b" }]);
    writeSet("2026-01-a", [{ op: "mkdir", path: "a" }]);
    fs.mkdirSync(data(), { recursive: true });
    const sets = readSetsFromFolder(setsDir);
    expect(pendingMigrations(data(), sets).map((s) => s.id)).toEqual(["2026-01-a", "2026-02-b"]);
    expect(applyMigration(data(), pendingMigrations(data(), sets)[0])).toEqual({ ok: true });
    expect(pendingMigrations(data(), sets).map((s) => s.id)).toEqual(["2026-02-b"]);
  });
});

describe("migrationRange / data-version", () => {
  /** An install with a workspace (data to migrate). */
  const withWorkspace = () => {
    fs.mkdirSync(data("workspaces"), { recursive: true });
    fs.writeFileSync(data("workspaces", "w.openp41ge-workspace"), "{}");
  };

  it("is nothing to do for a fresh install, which starts at the running version", () => {
    fs.mkdirSync(data(), { recursive: true });
    expect(migrationRange(data(), "0.1.0")).toBeNull();
    expect(readDataVersion(data())).toBe("0.1.0");
  });

  it("starts an install from before the journal at the beginning", () => {
    withWorkspace();
    expect(migrationRange(data(), "0.1.0")).toEqual({ from: "0.0.0", to: "0.1.0" });
  });

  it("covers the versions after the one the data was brought up to", () => {
    withWorkspace();
    writeDataVersion(data(), "0.1.0-alpha.10");
    expect(migrationRange(data(), "0.1.0")).toEqual({ from: "0.1.0-alpha.10", to: "0.1.0" });
    writeDataVersion(data(), "0.1.0");
    expect(migrationRange(data(), "0.1.0")).toBeNull();
    // An older app on newer data has nothing to run.
    expect(migrationRange(data(), "0.0.9")).toBeNull();
  });
});

describe("data-version", () => {
  it("is a top-level file in the data folder holding just the version", () => {
    fs.mkdirSync(data(), { recursive: true });
    writeDataVersion(data(), "0.1.0-alpha.11");
    expect(fs.readFileSync(data("data-version"), "utf-8").trim()).toBe("0.1.0-alpha.11");
    expect(readDataVersion(data())).toBe("0.1.0-alpha.11");
  });
});

describe("the journal's applied entries", () => {
  it("record the set's description", () => {
    writeSet("2026-01-a", [{ op: "mkdir", path: "a" }]);
    fs.mkdirSync(data(), { recursive: true });
    applyMigration(data(), readSetsFromFolder(setsDir)[0]);
    expect(readJournal(data()).applied[0]).toMatchObject({
      id: "2026-01-a",
      description: "2026-01-a",
    });
  });
});
