// @vitest-environment jsdom
/**
 * The workspace editor has no button row: no Open button (a workspace is
 * opened from the title bar's picker, in the window). Its content is the
 * first thing in the editor body, in both views.
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

describe("workspace editor (no button row)", () => {
  for (const mode of ["ui", "json"] as const) {
    it(`${mode} view: no Open button, no button row`, () => {
      const { container } = mount(mode);
      expect(container.querySelector(".we-toolbar")).toBeNull();
      expect(container.querySelector('[data-action="open-window"]')).toBeNull();
      const first = container.querySelector(".we-body")!.firstElementChild!;
      expect(first.classList.contains(mode === "json" ? "we-json" : "we-ui")).toBe(true);
    });
  }
});
