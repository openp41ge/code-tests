/**
 * The git extension defines the `git` binary for the platform's scoped
 * terminal; its allow / deny rules live in the extension's config
 * (`commands.git`). The defaults allow reading only: status, log, show, diff,
 * blame and listing branches — not writing, not options before the
 * subcommand, not diff's `--output` or external diff programs.
 */
import { describe, it, expect } from "vitest";
import { checkCommand, commandRulesAt, configDefaults, validateConfigSchema } from "openp41ge-sdk";
import { GIT_CONFIG_SCHEMA, GIT_RULES_PATH } from "@openp41ge-extension-git/config-schema";

const rules = commandRulesAt(configDefaults(GIT_CONFIG_SCHEMA), GIT_RULES_PATH)!;
const allowed = (line: string) => checkCommand(rules, line.split(" ").filter(Boolean)).allowed;

describe("git's command config", () => {
  it("is a valid schema whose defaults give git's rules", () => {
    expect(() => validateConfigSchema(GIT_CONFIG_SCHEMA)).not.toThrow();
    expect(GIT_RULES_PATH).toBe("commands.git");
    expect(rules.allow.length).toBeGreaterThan(0);
  });

  it("allows reading the repository", () => {
    for (const line of [
      "status",
      "status -s",
      "log --oneline -5",
      "show HEAD",
      "diff HEAD~1",
      "blame -L 1,5 a.ts",
      "branch --list",
      "branch --list -v",
    ]) {
      expect(allowed(line), line).toBe(true);
    }
  });

  it("refuses writing, options before the subcommand, and programs git would run", () => {
    for (const line of [
      "push",
      "commit -m x",
      "branch -D main",
      "branch new",
      "-c core.pager=sh log",
      "diff --output=/tmp/x",
      "log -p --output=/tmp/x",
      "diff --ext-diff",
    ]) {
      expect(allowed(line), line).toBe(false);
    }
  });
});
