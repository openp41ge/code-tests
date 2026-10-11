/**
 * closeTabsShowing: after a Delete, the open workspace's tabs that showed the
 * deleted repository / folder are closed, and its windows are told once.
 */
import { describe, it, expect, vi } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { OperationDispatcher } from "@openp41ge/main/services/operation-dispatcher";
import { closeTabsShowing } from "@openp41ge/main/services/close-tabs-showing";

function dispatcher() {
  let ws = types.createWorkspace("ws1");
  const winId = ws.windows[0].id;
  for (const [id, appType, config] of [
    ["repo", "ext:openp41ge-extension-git:repository", { repoName: "github.com/acme/app" }],
    ["file", "file-viewer", { filePath: "/repos/github.com/acme/app/main/a.ts" }],
    ["keep", "file-viewer", { filePath: "/tmp/b.ts" }],
  ] as const) {
    ws = ops.addTabToCell(ws, winId, types.createTab(id, appType, id, { ...config }), 0, 0);
  }
  const d = new OperationDispatcher(ws);
  const broadcast = vi.fn();
  d.setBroadcast(broadcast);
  return { d, broadcast };
}

const tabIds = (d: OperationDispatcher) =>
  d.getWorkspace().windows[0].grid.placements.flatMap((p) => p.tabIds);

describe("closeTabsShowing", () => {
  it("closes the tabs that showed the deleted repository, then broadcasts once", () => {
    const { d, broadcast } = dispatcher();
    closeTabsShowing(d, {
      repoName: "github.com/acme/app",
      folder: "/repos/github.com/acme/app",
    });
    expect(tabIds(d)).toEqual(["keep"]);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("changes nothing (and says nothing) when no tab showed it", () => {
    const { d, broadcast } = dispatcher();
    closeTabsShowing(d, { folder: "/elsewhere" });
    expect(tabIds(d)).toEqual(["repo", "file", "keep"]);
    expect(broadcast).not.toHaveBeenCalled();
  });
});
