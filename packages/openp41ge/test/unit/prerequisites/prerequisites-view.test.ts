/**
 * Unit tests for the prerequisites window's view: one row per prerequisite,
 * a green check or red cross at the end of each row, help links for what is
 * missing, and the Check again / Quit actions.
 */
import { describe, it, expect, vi } from "vitest";
import { renderPrerequisites } from "@openp41ge/renderer/prerequisites-view";

const met = {
  id: "git",
  name: "Git",
  requirement: "2.17 or newer",
  ok: true,
  detail: "2.47.0 at /opt/homebrew/bin/git",
};
const missing = {
  id: "ssh",
  name: "Other",
  requirement: "any",
  ok: false,
  detail: "Not found.",
  helpUrl: "https://example.com/get",
};

function setup(list = [met, missing]) {
  const root = document.createElement("div");
  const actions = { recheck: vi.fn(), quit: vi.fn(), openHelp: vi.fn() };
  renderPrerequisites(root, list, actions);
  return { root, actions };
}

describe("renderPrerequisites", () => {
  it("lists every prerequisite with its requirement and detail", () => {
    const { root } = setup();
    const rows = root.querySelectorAll("[data-prerequisite]");
    expect([...rows].map((r) => r.getAttribute("data-prerequisite"))).toEqual(["git", "ssh"]);
    expect(rows[0].textContent).toContain("Git");
    expect(rows[0].textContent).toContain("2.17 or newer");
    expect(rows[0].textContent).toContain("2.47.0 at /opt/homebrew/bin/git");
  });

  it("ends each row with a green check when met and a red cross when missing", () => {
    const { root } = setup();
    const [gitRow, otherRow] = root.querySelectorAll("[data-prerequisite]");
    const gitMark = gitRow.lastElementChild!;
    const otherMark = otherRow.lastElementChild!;
    expect(gitMark.getAttribute("data-status")).toBe("met");
    expect(gitMark.getAttribute("aria-label")).toBe("Found");
    expect(otherMark.getAttribute("data-status")).toBe("missing");
    expect(otherMark.getAttribute("aria-label")).toBe("Missing");
  });

  it("offers a help link only for missing prerequisites", () => {
    const { root, actions } = setup();
    const links = root.querySelectorAll<HTMLButtonElement>("[data-help]");
    expect(links).toHaveLength(1);
    links[0].click();
    expect(actions.openHelp).toHaveBeenCalledWith("ssh");
  });

  it("wires Check again and Quit", () => {
    const { root, actions } = setup();
    root.querySelector<HTMLButtonElement>("[data-action='recheck']")!.click();
    root.querySelector<HTMLButtonElement>("[data-action='quit']")!.click();
    expect(actions.recheck).toHaveBeenCalled();
    expect(actions.quit).toHaveBeenCalled();
  });

  it("follows the app's chrome: a title bar, and a bottom bar with square icon buttons", () => {
    const { root } = setup();
    expect(root.querySelector(".pq-titlebar")?.textContent?.trim()).toBe("Before you start");
    const bar = root.querySelector(".pq-bottombar")!;
    expect(bar.querySelector(".pq-status")?.textContent).toBe("1 missing");
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>(".pq-btn")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Quit", "Check again"]);
    expect(buttons.every((b) => b.querySelector("svg") && b.title)).toBe(true);
  });

  it("pads the title bar for the macOS window buttons", () => {
    const root = document.createElement("div");
    renderPrerequisites(root, [met], { recheck() {}, quit() {}, openHelp() {} }, { mac: true });
    expect(root.querySelector<HTMLElement>(".pq-titlebar")!.style.paddingLeft).toBe("82px");
    expect(root.querySelector(".pq-status")?.textContent).toBe("All found");
  });

  it("re-renders in place with new results", () => {
    const { root, actions } = setup();
    renderPrerequisites(root, [met], actions);
    expect(root.querySelectorAll("[data-prerequisite]")).toHaveLength(1);
  });
});
