/**
 * The agents-default-provider set (migrations/): the agents extension's
 * `providerId` setting is now `defaultProviderId` (the provider a chat uses
 * when it has not picked one), so a stored value keeps working.
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
const ID = "2026-10-14-agents-default-provider";

const RAW = JSON.parse(
  fs.readFileSync(path.resolve(APP_HERE, `../../../../../../migrations/${ID}.json`), "utf-8"),
) as { release: string };
const SET = parseInstructionSet(RAW);

let dir: string;
const config = () => path.join(dir, ".config", "config.json");
const run = () => runInstructionSet(SET, { root: dir });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-default-provider-set-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("the agents-default-provider set", () => {
  it("is required, and ships with the next release after alpha.17", () => {
    expect(REQUIRED_MIGRATIONS).toContain(ID);
    expect(RAW.release).toBe("0.1.0-alpha.18");
  });

  it("renames the agents extension's providerId to defaultProviderId", () => {
    fs.mkdirSync(path.dirname(config()));
    fs.writeFileSync(
      config(),
      JSON.stringify({
        extensions: {
          "openp41ge-extension-agents": { providerId: "openai", providers: { openai: {} } },
          "other-extension": { providerId: "keep" },
        },
      }),
    );
    expect(run().error).toBeUndefined();
    const data = JSON.parse(fs.readFileSync(config(), "utf-8"));
    expect(data.extensions["openp41ge-extension-agents"]).toEqual({
      defaultProviderId: "openai",
      providers: { openai: {} },
    });
    expect(data.extensions["other-extension"]).toEqual({ providerId: "keep" });
  });

  it("does nothing without a config file", () => {
    expect(run().error).toBeUndefined();
    expect(fs.existsSync(config())).toBe(false);
  });
});
