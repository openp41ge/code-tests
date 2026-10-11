// @vitest-environment jsdom
/**
 * The Git output tab: a read-only, terminal-style view of a git command the
 * platform ran and what it printed — as the user would have seen it had they
 * typed the command themselves.
 */
import { describe, it, expect } from "vitest";
import { render } from "lit";
import { renderGitOutput, terminalLines } from "@openp41ge-extension-git/git-output-view";

function show(context: Record<string, unknown>) {
  const container = document.createElement("div");
  render(renderGitOutput({ context }), container);
  return container;
}

describe("terminalLines", () => {
  it("shows what a terminal finally displays: \\r rewrites the line", () => {
    expect(
      terminalLines(
        "Cloning into bare repository 'x'...\nReceiving objects:  10%\rReceiving objects: 100%, done.\nfatal: nope\n",
      ),
    ).toEqual([
      "Cloning into bare repository 'x'...",
      "Receiving objects: 100%, done.",
      "fatal: nope",
    ]);
  });
});

describe("renderGitOutput", () => {
  it("shows the command as typed at a prompt, then git's output", () => {
    const c = show({
      command: "git clone --bare --progress git@github.com:a/b.git",
      output: "fatal: denied\n",
    });
    const lines = [...c.querySelectorAll(".term-line")].map((l) => l.textContent);
    expect(lines).toEqual([
      "$ git clone --bare --progress git@github.com:a/b.git",
      "fatal: denied",
    ]);
    expect(c.querySelector(".term-line.cmd")).toBeTruthy();
  });

  it("shows the message when no git command ran", () => {
    const c = show({ message: "Enter the full clone URL" });
    expect([...c.querySelectorAll(".term-line")].map((l) => l.textContent)).toEqual([
      "Enter the full clone URL",
    ]);
  });
});
