// @vitest-environment jsdom
/**
 * Unit tests for ResolveWindowWorkspaceStep — reads the workspace this window
 * shows (null: none) from the preload bridge into the startup context.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ResolveWindowWorkspaceStep } from "../../../src/renderer/bootstrap/steps/resolve-window-workspace.step";

// The step only reads/writes one field; a plain object rather than the
// StartupContext (which pulls a heavy, duplicate-registering graph).
type Ctx = { workspacePath: string | null };

function installBridge(workspacePath: string | null): void {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: { getWorkspacePath: () => workspacePath },
  } as unknown as typeof window.openp41ge;
}

function removeBridge(): void {
  delete (window as unknown as { openp41ge?: unknown }).openp41ge;
}

describe("ResolveWindowWorkspaceStep", () => {
  let context: Ctx;

  beforeEach(() => {
    context = { workspacePath: "stale" };
    removeBridge();
  });

  afterEach(() => removeBridge());

  it("leaves the context alone when the preload bridge is absent", async () => {
    await new ResolveWindowWorkspaceStep().run(context as never);
    expect(context.workspacePath).toBe("stale");
  });

  it("reads a window with no workspace", async () => {
    installBridge(null);
    await new ResolveWindowWorkspaceStep().run(context as never);
    expect(context.workspacePath).toBeNull();
  });

  it("reads the workspace a window shows", async () => {
    installBridge("/tmp/acme.openp41ge-workspace");
    await new ResolveWindowWorkspaceStep().run(context as never);
    expect(context.workspacePath).toBe("/tmp/acme.openp41ge-workspace");
  });
});
