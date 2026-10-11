/**
 * Unit tests for how a grid open translates per app type.
 */
import { describe, it, expect } from "vitest";
import { translateGridOpen } from "@openp41ge/renderer/services/grid-open-translators";

const label = (appType: string) => (appType.startsWith("ext:") ? "Ext" : undefined);

describe("translateGridOpen — other app types", () => {
  it("opens a registered app type generically with the config, and skips unregistered ones", () => {
    expect(translateGridOpen("ext:x:y", { a: 1 }, label)).toEqual({
      title: "Ext",
      config: { a: 1 },
    });
    expect(translateGridOpen("nope", {}, label)).toBeNull();
  });
});

describe("translateGridOpen — a tab key", () => {
  it("makes the key the tab's identity, so the open tab for it is reused", () => {
    expect(translateGridOpen("ext:x:y", { a: 1 }, label, "k1")).toEqual({
      title: "Ext",
      filePath: "k1",
      config: { a: 1 },
    });
  });
});

describe("translateGridOpen — extension tabs that label themselves", () => {
  it("titles the tab from the app's label for this config", () => {
    const labelled = (appType: string, config: Record<string, unknown>) =>
      appType === "ext:git:repository" ? String(config.branch ?? config.repoName) : undefined;
    expect(
      translateGridOpen(
        "ext:git:repository",
        { repoName: "github.com/a/b", branch: "dev" },
        labelled,
      ),
    ).toEqual({ title: "dev", config: { repoName: "github.com/a/b", branch: "dev" } });
  });
});

describe("translateGridOpen — config-editor", () => {
  it("opens one editor per extension, titled by the extension", () => {
    expect(
      translateGridOpen("config-editor", { extensionId: "openp41ge-extension-agents" }, label),
    ).toEqual({
      title: "Agents Settings",
      filePath: "config:openp41ge-extension-agents",
      config: { extensionId: "openp41ge-extension-agents" },
    });
    expect(translateGridOpen("config-editor", { extensionId: "my-tools" }, label)?.title).toBe(
      "My Tools Settings",
    );
    expect(translateGridOpen("config-editor", {}, label)).toBeNull();
  });
});
