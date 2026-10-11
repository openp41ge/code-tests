/**
 * The migration window's view: one row per set with its description and
 * state; while running a progress line; on failure the error with Retry,
 * Quit and Show the journal; when done, "Done".
 */
import { describe, it, expect, vi } from "vitest";
import { renderMigrations } from "@openp41ge/renderer/migrations-view";

const rows = [
  { id: "a", description: "Move repositories", state: "done" as const },
  { id: "b", description: "Move chats", state: "running" as const },
  { id: "c", description: "Tidy up", state: "pending" as const },
];

function setup(state: Parameters<typeof renderMigrations>[1]) {
  const root = document.createElement("div");
  const actions = { retry: vi.fn(), quit: vi.fn(), showJournal: vi.fn() };
  renderMigrations(root, state, actions);
  return { root, actions };
}

describe("renderMigrations", () => {
  it("lists each set with its description and state, and the progress", () => {
    const { root } = setup({ phase: "running", rows });
    const items = [...root.querySelectorAll("[data-migration]")];
    expect(
      items.map((i) => [i.getAttribute("data-migration"), i.getAttribute("data-state")]),
    ).toEqual([
      ["a", "done"],
      ["b", "running"],
      ["c", "pending"],
    ]);
    expect(items[1].textContent).toContain("Move chats");
    expect(root.querySelector(".mg-status")?.textContent).toBe("Updating 2 of 3…");
    expect(root.querySelector("[data-action]")).toBeNull();
  });

  it("on failure shows the error with Retry, Quit and Show the journal", () => {
    const { root, actions } = setup({
      phase: "failed",
      rows: [rows[0], { ...rows[1], state: "failed", error: "chats: exists" }, rows[2]],
    });
    expect(root.querySelector('[data-migration="b"]')?.textContent).toContain("chats: exists");
    expect(root.querySelector(".mg-status")?.textContent).toBe("Update failed");
    for (const action of ["retry", "quit", "show-journal"]) {
      (root.querySelector(`[data-action="${action}"]`) as HTMLElement).click();
    }
    expect(actions.retry).toHaveBeenCalled();
    expect(actions.quit).toHaveBeenCalled();
    expect(actions.showJournal).toHaveBeenCalled();
  });

  it("says when it is done", () => {
    const { root } = setup({
      phase: "done",
      rows: rows.map((r) => ({ ...r, state: "done" as const })),
    });
    expect(root.querySelector(".mg-status")?.textContent).toBe("Done");
  });
});

describe("renderMigrations — downloading", () => {
  it("offline: says it needs the internet once, with Quit and Retry", () => {
    const { root, actions } = setup({
      phase: "offline",
      rows: [],
      error: "getaddrinfo ENOTFOUND api.github.com",
    });
    expect(root.textContent).toContain("needs to be online");
    expect(root.textContent).toContain("ENOTFOUND");
    expect(root.querySelector(".mg-status")?.textContent).toBe("Offline");
    expect(root.querySelector('[data-action="show-journal"]')).toBeNull();
    (root.querySelector('[data-action="retry"]') as HTMLElement).click();
    expect(actions.retry).toHaveBeenCalled();
  });

  it("checking: says it is downloading", () => {
    const { root } = setup({ phase: "checking", rows: [] });
    expect(root.querySelector(".mg-status")?.textContent).toBe("Downloading the update…");
    expect(root.querySelector("[data-action]")).toBeNull();
  });
});

describe("renderMigrations — refusing to open", () => {
  it("newer data: names the version that last used it, Quit only", () => {
    const { root, actions } = setup({ phase: "newer", rows: [], dataVersion: "0.3.0" });
    expect(root.textContent).toContain("0.3.0");
    expect(root.querySelector('[data-action="retry"]')).toBeNull();
    (root.querySelector('[data-action="quit"]') as HTMLElement).click();
    expect(actions.quit).toHaveBeenCalled();
  });

  it("a failed check: shows the error, with Quit and Retry", () => {
    const { root } = setup({ phase: "error", rows: [], error: "boom" });
    expect(root.textContent).toContain("boom");
    expect(root.querySelector('[data-action="retry"]')).not.toBeNull();
    expect(root.querySelector('[data-action="quit"]')).not.toBeNull();
  });
});
