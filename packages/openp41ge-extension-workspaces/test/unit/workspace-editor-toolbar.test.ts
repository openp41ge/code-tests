// @vitest-environment jsdom
/**
 * The workspace editor's first content row is a row of buttons; the first is
 * Open, which opens (or focuses) the edited workspace's window through the
 * platform (`host.workspace.openWindow`). It shows in both views.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "lit";
import {
  renderWorkspaceEditor,
  type WorkspaceEditorHost,
  type WorkspaceEditorState,
} from "@openp41ge-extension-workspaces/workspace-editor";

function mount(mode: "ui" | "json") {
  const container = document.createElement("div");
  document.body.append(container);
  const openWindow = vi.fn();
  const state = {
    path: "/w.json",
    dir: "/w",
    data: { name: "n", repos: [] },
    mode,
    loading: false,
    saved: true,
    savedData: undefined,
    undoStack: [],
    openRepos: [],
    nameLocked: true,
  } as unknown as WorkspaceEditorState;
  const host = {
    surface: "grid:workspace-editor",
    context: { path: "/w.json", dir: "/w" },
    state,
    setState: () => {},
    dispatch: async () => ({}),
    subscribe: () => () => {},
    log: { debug() {}, info() {}, warn() {}, error() {} },
    openTab: () => {},
    workspace: { openWindow, onWorkspaceFileChanged: () => () => {} },
  } as unknown as WorkspaceEditorHost;
  render(renderWorkspaceEditor(host), container);
  return { container, openWindow };
}

describe("workspace editor toolbar", () => {
  for (const mode of ["ui", "json"] as const) {
    it(`${mode} view: the first content row is the buttons row, Open first`, () => {
      const { container } = mount(mode);
      const body = container.querySelector(".we-body")!;
      const first = body.firstElementChild!;
      expect(first.classList.contains("we-toolbar")).toBe(true);
      const buttons = [...first.querySelectorAll("button")];
      expect(buttons[0]?.dataset.action).toBe("open-window");
      expect(buttons[0]?.textContent?.trim()).toBe("Open");
    });
  }

  it("the buttons sit at the right of the row", () => {
    const { container } = mount("ui");
    const css = [...container.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    expect(css).toMatch(/\.we-toolbar\s*\{[^}]*justify-content:\s*flex-end;/);
  });

  it("Open opens the edited workspace's window", () => {
    const { container, openWindow } = mount("ui");
    container.querySelector<HTMLElement>('[data-action="open-window"]')!.click();
    expect(openWindow).toHaveBeenCalledWith("/w.json");
  });
});
