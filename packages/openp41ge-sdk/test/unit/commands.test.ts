/**
 * Unit tests for the command contract: a command line typed into a scoped
 * terminal is split into arguments (no shell), checked against a binary's
 * allow / deny pattern rules (deny wins), and extensions define the binaries
 * they make runnable (`registerCommandBinaries`), naming where in their own
 * config the rules live.
 */
import { describe, it, expect, afterEach } from "vitest";
import { beginExtensionScope, endExtensionScope, getScopedCommandBinaries } from "./scope-helper";
import {
  PLATFORM_DRAG_KINDS,
  PLATFORM_OPEN_KINDS,
  checkCommand,
  commandRulesAt,
  matchCommandRule,
  registerCommandBinaries,
  splitCommandLine,
  validateDragPayload,
  validateOpenParams,
} from "@openp41ge-sdk";

afterEach(() => endExtensionScope());

describe("splitCommandLine", () => {
  it("splits on whitespace", () => {
    expect(splitCommandLine("  log   --oneline -5 ")).toEqual(["log", "--oneline", "-5"]);
    expect(splitCommandLine("")).toEqual([]);
  });

  it("groups quoted text, single quotes literally", () => {
    expect(splitCommandLine(`log --grep "fix the bug" 'a "b" c'`)).toEqual([
      "log",
      "--grep",
      "fix the bug",
      'a "b" c',
    ]);
    expect(splitCommandLine(`s'/a b/'c`)).toEqual(["s/a b/c"]);
    expect(splitCommandLine(`""`)).toEqual([""]);
  });

  it("escapes with a backslash, outside quotes and inside double quotes", () => {
    expect(splitCommandLine(`a\\ b "c \\" d" 'e\\f'`)).toEqual(["a b", 'c " d', "e\\f"]);
  });

  it("passes shell syntax through as plain text", () => {
    expect(splitCommandLine("log | rm -rf / ; echo $HOME > x && *")).toEqual([
      "log",
      "|",
      "rm",
      "-rf",
      "/",
      ";",
      "echo",
      "$HOME",
      ">",
      "x",
      "&&",
      "*",
    ]);
  });

  it("throws on an unterminated quote", () => {
    expect(() => splitCommandLine(`log "open`)).toThrow(/unterminated/);
    expect(() => splitCommandLine(`log 'open`)).toThrow(/unterminated/);
  });
});

describe("matchCommandRule", () => {
  it("matches literal words exactly, the whole argument list", () => {
    expect(matchCommandRule("status", ["status"])).toBe(true);
    expect(matchCommandRule("status", ["status", "-s"])).toBe(false);
    expect(matchCommandRule("status", ["stat"])).toBe(false);
    expect(matchCommandRule("", [])).toBe(true);
    expect(matchCommandRule("", ["x"])).toBe(false);
  });

  it("matches ** to any number of arguments, anywhere", () => {
    expect(matchCommandRule("log **", ["log"])).toBe(true);
    expect(matchCommandRule("log **", ["log", "--oneline", "-5"])).toBe(true);
    expect(matchCommandRule("**", [])).toBe(true);
    expect(matchCommandRule("** --output*", ["log", "-p", "--output=x"])).toBe(true);
    expect(matchCommandRule("** --output*", ["log", "-p"])).toBe(false);
    expect(matchCommandRule("** -i **", ["-n", "-i", "s/a/b/", "f"])).toBe(true);
  });

  it("matches * to exactly one argument, and inside a word to any characters", () => {
    expect(matchCommandRule("-C * log **", ["-C", "/x", "log"])).toBe(true);
    expect(matchCommandRule("-C * log **", ["-C", "log"])).toBe(false);
    expect(matchCommandRule("--output*", ["--output=a"])).toBe(true);
    expect(matchCommandRule("--output*", ["--output"])).toBe(true);
    expect(matchCommandRule("*.txt", ["a.txt"])).toBe(true);
    expect(matchCommandRule("*.txt", ["a.txt.sh"])).toBe(false);
  });

  it("matches a|b to either word", () => {
    expect(matchCommandRule("show|diff|blame **", ["diff", "HEAD"])).toBe(true);
    expect(matchCommandRule("show|diff|blame **", ["push"])).toBe(false);
  });

  it("treats other characters in a rule literally", () => {
    expect(matchCommandRule("a.b", ["a.b"])).toBe(true);
    expect(matchCommandRule("a.b", ["axb"])).toBe(false);
    expect(matchCommandRule("(x)", ["(x)"])).toBe(true);
  });

  it("splits the rule like a command line, so a rule can name an argument with spaces", () => {
    expect(matchCommandRule(`log --grep "a b"`, ["log", "--grep", "a b"])).toBe(true);
  });
});

describe("checkCommand", () => {
  const rules = {
    allow: ["status **", "log **", "show|diff **", "branch --list **"],
    deny: ["** --output*", "** --ext-diff **"],
  };

  it("allows a line an allow rule matches", () => {
    expect(checkCommand(rules, ["log", "--oneline"])).toEqual({ allowed: true });
  });

  it("refuses a line no allow rule matches", () => {
    const r = checkCommand(rules, ["push"]);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/no allow rule matches/);
  });

  it("lets deny win", () => {
    const r = checkCommand(rules, ["diff", "--output=/tmp/x"]);
    expect(r).toEqual({ allowed: false, reason: "denied by '** --output*'" });
  });

  it("refuses options before the subcommand unless a rule names them", () => {
    expect(checkCommand(rules, ["-c", "core.pager=sh", "log"]).allowed).toBe(false);
    expect(checkCommand(rules, ["branch", "-D", "main"]).allowed).toBe(false);
  });

  it("refuses everything with no rules", () => {
    expect(checkCommand({ allow: [], deny: [] }, []).allowed).toBe(false);
  });
});

describe("commandRulesAt", () => {
  it("reads { allow, deny } at a dot path of a config", () => {
    const config = { commands: { git: { allow: ["log **"], deny: ["** -p"] } } };
    expect(commandRulesAt(config, "commands.git")).toEqual({ allow: ["log **"], deny: ["** -p"] });
  });

  it("treats a missing deny as none", () => {
    expect(commandRulesAt({ g: { allow: ["**"] } }, "g")).toEqual({ allow: ["**"], deny: [] });
  });

  it("returns null for a missing path or a malformed value", () => {
    expect(commandRulesAt({}, "commands.git")).toBeNull();
    expect(commandRulesAt({ g: { allow: "log" } }, "g")).toBeNull();
    expect(commandRulesAt({ g: { allow: [1] } }, "g")).toBeNull();
  });
});

describe("registerCommandBinaries", () => {
  it("records each binary with its label and config path", () => {
    beginExtensionScope("ext-git", "1.0.0");
    registerCommandBinaries({ git: { label: "Git", config: "commands.git" } });
    expect(getScopedCommandBinaries()).toEqual([
      { binary: "git", label: "Git", config: "commands.git" },
    ]);
  });

  it("throws outside an extension scope", () => {
    expect(() => registerCommandBinaries({ git: { label: "Git", config: "c" } })).toThrow(
      /outside an extension scope/,
    );
  });

  it("refuses a binary name that is a path or has odd characters", () => {
    beginExtensionScope("ext-a", "1.0.0");
    for (const name of ["/bin/sh", "../x", "a b", "", "-x"]) {
      expect(() => registerCommandBinaries({ [name]: { label: "X", config: "c" } })).toThrow(
        /binary name/,
      );
    }
  });

  it("refuses a missing label or config path, and a duplicate binary", () => {
    beginExtensionScope("ext-a", "1.0.0");
    expect(() => registerCommandBinaries({ sed: { label: "", config: "c" } } as never)).toThrow(
      /label/,
    );
    expect(() => registerCommandBinaries({ sed: { label: "sed", config: "" } } as never)).toThrow(
      /config/,
    );
    registerCommandBinaries({ sed: { label: "sed", config: "c" } });
    expect(() => registerCommandBinaries({ sed: { label: "sed", config: "c" } })).toThrow(
      /already/,
    );
  });
});

describe("the command-run kind", () => {
  it("is a platform open kind of a binary, optionally a run", () => {
    expect(PLATFORM_OPEN_KINDS.map((k) => k.name)).toContain("openp41ge/command-run");
    expect(() =>
      validateOpenParams("openp41ge/command-run", {
        binary: "git",
        repo: "github.com/a/b",
        worktree: "main",
      }),
    ).not.toThrow();
    expect(() => validateOpenParams("openp41ge/command-run", {})).toThrow(/'binary' is required/);
  });

  it("is a platform drag kind carrying a run", () => {
    expect(PLATFORM_DRAG_KINDS).toContain("openp41ge/command-run");
    expect(
      validateDragPayload({
        kind: "openp41ge/command-run",
        binary: "git",
        repo: "github.com/a/b",
        worktree: "main",
        args: '["log","-5"]',
        runId: "r1",
      }),
    ).toMatchObject({ binary: "git", runId: "r1" });
  });
});
