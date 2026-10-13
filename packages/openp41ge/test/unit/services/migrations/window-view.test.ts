/**
 * What the migration window is sent: its phase and how many updates are done
 * out of how many — never the updates' descriptions or errors (those stay in
 * the journal and the logs).
 */
import { describe, it, expect } from "vitest";
import { toWindowView, migrationsSummary } from "../../../../src/main/services/migrations/window-view";

const rows = [
  { id: "a", description: "Move repositories", state: "done" as const },
  { id: "b", description: "Move chats", state: "failed" as const, error: "ENOTDIR: /Users/u/.openp41ge-code/x" },
  { id: "c", description: "Tidy up", state: "pending" as const },
];

describe("toWindowView", () => {
  it("counts the updates done out of all of them", () => {
    expect(toWindowView({ phase: "running", rows: [rows[0], { ...rows[1], state: "running" }, rows[2]] })).toEqual({
      phase: "running",
      completed: 1,
      total: 3,
    });
  });

  it("sends no descriptions, ids or errors", () => {
    const view = JSON.stringify(toWindowView({ phase: "failed", rows }));
    for (const hidden of ["Move repositories", "Move chats", "ENOTDIR", ".openp41ge-code", '"a"']) {
      expect(view).not.toContain(hidden);
    }
  });

  it("drops a download or check error, keeps the newer data's version", () => {
    expect(toWindowView({ phase: "offline", rows: [], error: "getaddrinfo ENOTFOUND api.github.com" })).toEqual({
      phase: "offline",
      completed: 0,
      total: 0,
    });
    expect(toWindowView({ phase: "newer", rows: [], dataVersion: "0.3.0" })).toEqual({
      phase: "newer",
      completed: 0,
      total: 0,
      dataVersion: "0.3.0",
    });
  });
});

describe("toWindowView: what an offline download needs", () => {
  it("sends the requirements while offline", () => {
    const requirements = { internet: true, github: "rate-limited" as const, githubResetAt: 1_760_000_000_000 };
    expect(toWindowView({ phase: "offline", rows: [], error: "x", requirements })).toEqual({
      phase: "offline",
      completed: 0,
      total: 0,
      requirements,
    });
  });

  it("a release without an update this version needs is a failed update", () => {
    expect(toWindowView({ phase: "failed", rows: [] })).toEqual({ phase: "failed", completed: 0, total: 0 });
  });
});

describe("migrationsSummary (the manager window's Migrations tab)", () => {
  const journal = {
    applied: [
      { id: "a", description: "Move chats", at: "2026-10-10T09:00:00.000Z", done: ["move /Users/u/x → y"] },
      { id: "b", at: "2026-10-10T09:00:01.000Z", done: [] },
    ],
    failed: { id: "c", at: "2026-10-11T09:00:00.000Z", error: "ENOTDIR /Users/u/z" },
  };

  it("counts the updates, the last one's time, and whether one failed", () => {
    expect(migrationsSummary(journal, "0.1.0-alpha.12", "0.1.0-alpha.11")).toEqual({
      appVersion: "0.1.0-alpha.12",
      dataVersion: "0.1.0-alpha.11",
      updates: 2,
      lastUpdateAt: "2026-10-10T09:00:01.000Z",
      failed: true,
    });
  });

  it("sends no ids, descriptions, what they did or errors", () => {
    const sent = JSON.stringify(migrationsSummary(journal, "1", "1"));
    for (const hidden of ["Move chats", "/Users/u", "ENOTDIR", '"a"', '"c"']) expect(sent).not.toContain(hidden);
  });

  it("nothing ran: no count, no time, not failed", () => {
    expect(migrationsSummary({ applied: [] }, "0.1.0", undefined)).toEqual({
      appVersion: "0.1.0",
      updates: 0,
      failed: false,
    });
  });
});
