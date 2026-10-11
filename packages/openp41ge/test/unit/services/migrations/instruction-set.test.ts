/**
 * parseInstructionSet: a downloaded instruction set is data, checked before
 * anything runs — known operations only, relative paths that stay inside the
 * data folder.
 */
import { describe, it, expect } from "vitest";
import { parseInstructionSet } from "@openp41ge/main/services/migrations/instruction-set";
import { inApp } from "@app-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const set = (steps: unknown[]) => ({
  id: "2026-10-test",
  description: "test",
  release: "0.2.0",
  steps,
});

describe("parseInstructionSet", () => {
  it("accepts known operations, nested in iterations and conditions", () => {
    const parsed = parseInstructionSet(
      set([
        { op: "mkdir", path: "a/b" },
        {
          op: "forEachWorkspace",
          do: [
            {
              op: "if",
              missing: "${workspace.dataDir}/x",
              do: [{ op: "mkdir", path: "${workspace.dataDir}/x" }],
            },
          ],
        },
      ]),
    );
    expect(parsed.id).toBe("2026-10-test");
    expect(parsed.steps).toHaveLength(2);
  });

  it.each([
    ["an unknown operation", [{ op: "exec", command: "rm -rf /" }]],
    ["an absolute path", [{ op: "mkdir", path: "/etc/x" }]],
    ["a path leaving the folder", [{ op: "move", from: "a", to: "../b" }]],
    ["a missing field", [{ op: "move", from: "a" }]],
    ["an unknown variable", [{ op: "mkdir", path: "${home}/x" }]],
    ["a bad nested step", [{ op: "forEachWorkspace", do: [{ op: "delete", path: "x" }] }]],
  ])("refuses %s", (_what, steps) => {
    expect(() => parseInstructionSet(set(steps))).toThrow();
  });

  it("refuses a set without an id, description or release", () => {
    expect(() => parseInstructionSet({ steps: [] })).toThrow(/id/);
  });
});

describe("the repo's migrations/ folder", () => {
  it("holds only sets that pass the checks, named by their id", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.resolve(APP_HERE, "../../../../../../migrations");
    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const set = parseInstructionSet(JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8")));
      expect(`${set.id}.json`).toBe(name);
    }
  });
});

describe("REQUIRED_MIGRATIONS", () => {
  it("lists exactly the sets in the repo's migrations/ folder (add a new set's id there)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const { REQUIRED_MIGRATIONS } =
      await import("@openp41ge/main/services/migrations/required-migrations");
    const dir = path.resolve(APP_HERE, "../../../../../../migrations");
    const ids = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.replace(/\.json$/, ""))
      .sort();
    expect([...REQUIRED_MIGRATIONS].sort()).toEqual(ids);
  });
});
