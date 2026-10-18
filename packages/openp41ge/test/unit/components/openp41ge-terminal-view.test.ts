/**
 * <openp41ge-terminal-view>, the platform's scoped terminal (`terminal` grid
 * tab, `{ binary, repo, worktree, runId? }`): the runs of its binary in its
 * worktree (agents' too, named), oldest first, updated live; a prompt for
 * that binary only — a typed line is split into arguments (no shell) and run
 * in the worktree; a refused line says why and links to the settings of the
 * extension that defines the binary; ↑ recalls lines typed before; a run
 * named by `runId` is marked. A binary nothing defines cannot be typed into.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-terminal-view";
import { setTerminalDeps, type TerminalDeps } from "../../../src/renderer/services/terminal-deps";
import {
  TERMINAL_APP_TYPE,
  terminalAppRegistration,
  terminalTabKey,
} from "../../../src/renderer/apps/terminal";
import type { CommandRun } from "../../../src/shared/command-run";
import type { CommandRequest, CommandResult } from "openp41ge-sdk";

type View = HTMLElement & {
  binary: string;
  repo: string;
  worktree: string;
  runId: string;
  updateComplete: Promise<unknown>;
};

const tick = () => new Promise((r) => setTimeout(r, 0));

const run = (over: Partial<CommandRun>): CommandRun => ({
  runId: "r1",
  binary: "git",
  args: ["log", "-1"],
  repo: "github.com/a/app",
  worktree: "main",
  by: "you",
  startedAt: 1,
  endedAt: 2,
  state: "done",
  exitCode: 0,
  output: "abc123 First\n",
  truncated: false,
  ...over,
});

function fakeDeps(runs: CommandRun[] = []) {
  const ran: CommandRequest[] = [];
  const settings: string[] = [];
  let listener: ((e: { append: boolean; run: CommandRun }) => void) | null = null;
  let nextResult: CommandResult = {
    ok: true,
    exitCode: 0,
    output: "",
    truncated: false,
    runId: "r9",
  };
  const deps: TerminalDeps = {
    binaries: async () => [
      {
        binary: "git",
        label: "Git",
        extensionId: "openp41ge-extension-git",
        allow: ["log **"],
        deny: [],
      },
    ],
    runs: async (filter) =>
      runs
        .filter(
          (r) =>
            r.binary === filter.binary && r.repo === filter.repo && r.worktree === filter.worktree,
        )
        .reverse(),
    run: async (request) => {
      ran.push(request);
      return nextResult;
    },
    onRun: (fn) => {
      listener = fn;
      return () => (listener = null);
    },
    openSettings: (id) => settings.push(id),
  };
  return {
    deps,
    ran,
    settings,
    push: (e: { append: boolean; run: CommandRun }) => listener?.(e),
    setResult: (r: CommandResult) => (nextResult = r),
  };
}

async function mount(fake: ReturnType<typeof fakeDeps>, over: Partial<View> = {}): Promise<View> {
  setTerminalDeps(fake.deps);
  const el = document.createElement("openp41ge-terminal-view") as View;
  el.binary = "git";
  el.repo = "github.com/a/app";
  el.worktree = "main";
  Object.assign(el, over);
  document.body.appendChild(el);
  await tick();
  await el.updateComplete;
  return el;
}

const root = (el: View) => el.shadowRoot!;
const input = (el: View) => root(el).querySelector<HTMLInputElement>("input.tv-input")!;
const entries = (el: View) => [...root(el).querySelectorAll(".tv-run")];

async function type(el: View, line: string, key = "Enter"): Promise<void> {
  const i = input(el);
  i.value = line;
  i.dispatchEvent(new Event("input"));
  i.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  await tick();
  await el.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = "";
  setTerminalDeps(null);
});

describe("terminal view", () => {
  test("shows its binary's runs in its worktree, oldest first, with who ran them", async () => {
    const fake = fakeDeps([
      run({ runId: "r1", args: ["log", "-1"], output: "first\n" }),
      run({ runId: "r2", args: ["status"], by: "openp41ge-extension-agents", output: "clean\n" }),
      run({ runId: "r3", worktree: "other", output: "elsewhere\n" }),
    ]);
    const el = await mount(fake);
    const shown = entries(el);
    expect(shown).toHaveLength(2);
    expect(shown[0].textContent).toContain("git › log -1");
    expect(shown[0].textContent).toContain("first");
    expect(shown[1].textContent).toContain("status");
    expect(shown[1].textContent).toContain("agents");
    expect(root(el).textContent).not.toContain("elsewhere");
    expect(root(el).querySelector(".tv-prompt")?.textContent).toContain("git ›");
  });

  test("quotes an argument with spaces when it shows a run", async () => {
    const el = await mount(fakeDeps([run({ args: ["log", "--grep", "fix bug"] })]));
    expect(entries(el)[0].textContent).toContain(`git › log --grep "fix bug"`);
  });

  test("shows a failing run's exit, and an error", async () => {
    const el = await mount(
      fakeDeps([run({ exitCode: 128, error: "exited with 128", output: "fatal: x\n" })]),
    );
    expect(entries(el)[0].textContent).toContain("exited with 128");
  });

  test("runs a typed line split into arguments, in its worktree", async () => {
    const fake = fakeDeps();
    const el = await mount(fake);
    await type(el, `log --grep "fix the bug" -1`);
    expect(fake.ran).toEqual([
      {
        binary: "git",
        args: ["log", "--grep", "fix the bug", "-1"],
        repo: "github.com/a/app",
        worktree: "main",
      },
    ]);
    expect(input(el).value).toBe("");
  });

  test("shows a run live as it starts, prints and ends", async () => {
    const fake = fakeDeps();
    const el = await mount(fake);
    fake.push({
      append: false,
      run: run({ runId: "r5", state: "running", output: "", exitCode: null }),
    });
    await el.updateComplete;
    expect(entries(el)).toHaveLength(1);
    expect(root(el).querySelector(".tv-running")).not.toBeNull();
    fake.push({ append: true, run: run({ runId: "r5", state: "running", output: "part 1\n" }) });
    fake.push({ append: true, run: run({ runId: "r5", state: "running", output: "part 2\n" }) });
    await el.updateComplete;
    expect(entries(el)[0].textContent).toContain("part 1\npart 2");
    fake.push({ append: true, run: run({ runId: "r5", state: "done", output: "" }) });
    await el.updateComplete;
    expect(root(el).querySelector(".tv-running")).toBeNull();
    expect(entries(el)[0].textContent).toContain("part 1\npart 2");
  });

  test("ignores runs of another binary or worktree", async () => {
    const fake = fakeDeps();
    const el = await mount(fake);
    fake.push({ append: false, run: run({ runId: "x", binary: "sed" }) });
    fake.push({ append: false, run: run({ runId: "y", worktree: "other" }) });
    await el.updateComplete;
    expect(entries(el)).toHaveLength(0);
  });

  test("says why a line was refused, with a link to the defining extension's settings", async () => {
    const fake = fakeDeps();
    fake.setResult({
      ok: false,
      exitCode: null,
      output: "",
      truncated: false,
      runId: "",
      error: "git push is not allowed: no allow rule matches",
    });
    const el = await mount(fake);
    await type(el, "push");
    const refusal = root(el).querySelector(".tv-refused")!;
    expect(refusal.textContent).toContain("git push is not allowed: no allow rule matches");
    refusal.querySelector<HTMLButtonElement>("button")!.click();
    expect(fake.settings).toEqual(["openp41ge-extension-git"]);
  });

  test("refuses an unterminated quote without running anything", async () => {
    const fake = fakeDeps();
    const el = await mount(fake);
    await type(el, `log "open`);
    expect(fake.ran).toEqual([]);
    expect(root(el).querySelector(".tv-refused")?.textContent).toMatch(/unterminated/);
  });

  test("recalls the lines typed before with ↑ and ↓", async () => {
    const fake = fakeDeps([
      run({ runId: "r1", args: ["log", "-1"] }),
      run({ runId: "r2", args: ["status"], by: "openp41ge-extension-agents" }),
      run({ runId: "r3", args: ["log", "-2"] }),
    ]);
    const el = await mount(fake);
    await type(el, "", "ArrowUp");
    expect(input(el).value).toBe("log -2");
    await type(el, input(el).value, "ArrowUp");
    expect(input(el).value).toBe("log -1");
    await type(el, input(el).value, "ArrowDown");
    expect(input(el).value).toBe("log -2");
  });

  test("marks the run it was opened for", async () => {
    const el = await mount(fakeDeps([run({ runId: "r1" }), run({ runId: "r2" })]), {
      runId: "r2",
    });
    expect(root(el).querySelector(".tv-run.tv-focused")?.getAttribute("data-run-id")).toBe("r2");
  });

  test("cannot be typed into when no extension defines its binary", async () => {
    const el = await mount(fakeDeps(), { binary: "sed" });
    expect(input(el).disabled).toBe(true);
    expect(root(el).textContent).toMatch(/no extension defines .*sed/i);
  });
});

describe("terminal app type", () => {
  test("opens the command-run kind and needs a workspace", () => {
    expect(terminalAppRegistration.id).toBe(TERMINAL_APP_TYPE);
    expect(terminalAppRegistration.opens).toEqual(["openp41ge/command-run"]);
    expect(terminalAppRegistration.workspace ?? "required").toBe("required");
  });

  test("keys one tab per binary and worktree", () => {
    expect(terminalTabKey({ binary: "git", repo: "github.com/a/app", worktree: "main" })).toBe(
      "terminal:git:github.com/a/app@main",
    );
  });
});
