/**
 * The git-history-search set (migrations/): the git extension's History
 * sidebar is now Git History Search (surface `history-search`), so saved
 * History tabs in every workspace file move to the new app type and title.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { parseInstructionSet } from "@openp41ge/main/services/migrations/instruction-set";
import { runInstructionSet } from "@openp41ge/main/services/migrations/migration-runner";
import { REQUIRED_MIGRATIONS } from "@openp41ge/main/services/migrations/required-migrations";
import { inApp } from "@code-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);
const ID = "2026-10-13-git-history-search";

const RAW = JSON.parse(
  fs.readFileSync(path.resolve(APP_HERE, `../../../../../../migrations/${ID}.json`), "utf-8"),
) as { release: string };
const SET = parseInstructionSet(RAW);

let dir: string;
const wsFile = (id: string) => path.join(dir, "workspaces", `${id}.openp41ge-workspace`);
const run = () => runInstructionSet(SET, { root: dir });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "history-search-set-"));
  fs.mkdirSync(path.join(dir, "workspaces"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("the git-history-search set", () => {
  it("is required, and ships with the next release after alpha.14", () => {
    expect(REQUIRED_MIGRATIONS).toContain(ID);
    expect(RAW.release).toBe("0.1.0-alpha.15");
  });

  it("moves saved History tabs to Git History Search, in every workspace", () => {
    for (const id of ["one", "two"]) {
      fs.writeFileSync(
        wsFile(id),
        JSON.stringify({
          id,
          systemTabs: {
            h: { id: "h", appType: "ext:openp41ge-extension-git:history", title: "History" },
            r: { id: "r", appType: "ext:openp41ge-extension-git:repositories", title: "Repositories" },
          },
        }),
      );
    }
    expect(run().error).toBeUndefined();
    for (const id of ["one", "two"]) {
      const data = JSON.parse(fs.readFileSync(wsFile(id), "utf-8"));
      expect(data.systemTabs.h).toEqual({
        id: "h",
        appType: "ext:openp41ge-extension-git:history-search",
        title: "Git History Search",
      });
      expect(data.systemTabs.r.appType).toBe("ext:openp41ge-extension-git:repositories");
    }
  });

  it("does nothing without workspaces", () => {
    fs.rmSync(path.join(dir, "workspaces"), { recursive: true });
    expect(run().error).toBeUndefined();
  });
});
