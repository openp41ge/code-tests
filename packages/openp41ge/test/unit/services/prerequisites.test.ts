/**
 * Unit tests for the prerequisites list: what the app needs to run, each
 * marked met or missing from the startup checks.
 */
import { describe, it, expect } from "vitest";
import { allMet, prerequisitesFor } from "@openp41ge/main/services/prerequisites";

describe("prerequisitesFor", () => {
  it("marks Git met with the version found (no path on the system)", () => {
    const [git] = prerequisitesFor({ ok: true, path: "/opt/homebrew/bin/git", version: "2.47.0" });
    expect(git).toMatchObject({
      id: "git",
      name: "Git",
      requirement: "2.17 or newer",
      ok: true,
      detail: "Version 2.47.0",
    });
  });

  it("marks Git missing with the problem and where to get it", () => {
    const [git] = prerequisitesFor({ ok: false, problem: "Git was not found." });
    expect(git).toMatchObject({
      id: "git",
      ok: false,
      detail: "Git was not found.",
      helpUrl: "https://git-scm.com/downloads",
    });
  });
});

describe("allMet", () => {
  it("is true only when every prerequisite is met", () => {
    const ok = prerequisitesFor({ ok: true, path: "/usr/bin/git", version: "2.50.1" });
    const missing = prerequisitesFor({ ok: false, problem: "x" });
    expect(allMet(ok)).toBe(true);
    expect(allMet(missing)).toBe(false);
    expect(allMet([...ok, ...missing])).toBe(false);
  });
});
