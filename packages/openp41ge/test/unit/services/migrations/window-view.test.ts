/**
 * What the migration window is sent: its phase and how many updates are done
 * out of how many — never the updates' descriptions or errors (those stay in
 * the journal and the logs).
 */
import { describe, it, expect } from "vitest";
import { toWindowView } from "../../../../src/main/services/migrations/window-view";

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
