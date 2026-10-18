/**
 * Verifies the built-in agent tools register through their own packages.
 *
 * Each built-in tool (read_file, search_files, …) lives in a separate package and
 * self-registers via `register(registry)`. This test exercises the aggregate
 * `registerBuiltinTools` entry point so a regression in the plugin wiring fails
 * loudly.
 */

import { describe, it, expect } from "vitest";
import { ToolRegistry } from "@openp41ge-extension-agents/backend/tool-registry";
import { registerBuiltinTools } from "@openp41ge-extension-agents/tools/index";

describe("registerBuiltinTools", () => {
  it("registers the file tools, create_worktree and run_command (git runs through run_command)", () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    const names = registry
      .list()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual([
      "create_or_replace_file",
      "create_worktree",
      "edit_file",
      "read_file",
      "run_command",
      "search_files",
    ]);
  });

  it("each registered tool exposes the full tool contract", () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    for (const tool of registry.list()) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters.type).toBe("object");
      expect(typeof tool.execute).toBe("function");
    }
  });
});
