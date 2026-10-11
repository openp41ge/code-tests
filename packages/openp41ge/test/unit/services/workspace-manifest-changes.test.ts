/**
 * WorkspaceManifestChanges — a touched workspace file is reported once it
 * settles, and only when its manifest (everything but the layout session)
 * differs from the last one seen: layout saves, rewrites of the same content
 * and half-written files are not changes; a new or deleted file is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  WorkspaceManifestChanges,
  manifestKey,
} from "../../../src/main/services/workspace-manifest-changes";

const FILE = "/ws/a.openp41ge-workspace";
const base = {
  id: "a",
  name: "A",
  version: 2,
  createdAt: "2026-01-01",
  dataDir: "",
  repos: [{ url: "git@github.com:o/r.git", worktrees: ["main"] }],
  windows: [{ id: "w1" }],
  editorTabs: { t1: {} },
};

let files: Map<string, string>;
let notified: string[];
let changes: WorkspaceManifestChanges;

const write = (p: string, data: unknown) => files.set(p, JSON.stringify(data));
const settle = () => vi.advanceTimersByTime(200);

beforeEach(() => {
  vi.useFakeTimers();
  files = new Map();
  notified = [];
  write(FILE, base);
  changes = new WorkspaceManifestChanges(
    (p) => files.get(p) ?? null,
    (p) => notified.push(p),
    100,
  );
  changes.prime([FILE]);
});

afterEach(() => vi.useRealTimers());

describe("manifestKey", () => {
  it("ignores the layout session and key order", () => {
    const a = manifestKey({ ...base, windows: [], sharedSidebars: {} });
    const b = manifestKey({ repos: base.repos, dataDir: "", ...base, scopedFolders: ["/x"] });
    expect(a).toBe(b);
    expect(manifestKey({ ...base, name: "B" })).not.toBe(a);
  });
});

describe("WorkspaceManifestChanges", () => {
  it("reports a manifest change once the file settles", () => {
    write(FILE, {
      ...base,
      repos: [...base.repos, { url: "git@github.com:o/s.git", worktrees: [] }],
    });
    changes.touched(FILE);
    changes.touched(FILE);
    expect(notified).toEqual([]);
    settle();
    expect(notified).toEqual([FILE]);
  });

  it("does not report a layout-only save or an unchanged rewrite", () => {
    write(FILE, { ...base, windows: [{ id: "w2" }], tabGroups: {} });
    changes.touched(FILE);
    settle();
    write(FILE, base);
    changes.touched(FILE);
    settle();
    expect(notified).toEqual([]);
  });

  it("does not report a half-written file, and reports it once complete", () => {
    files.set(FILE, '{"id":"a","na');
    changes.touched(FILE);
    settle();
    expect(notified).toEqual([]);
    write(FILE, { ...base, name: "Renamed" });
    changes.touched(FILE);
    settle();
    expect(notified).toEqual([FILE]);
  });

  it("reports a new file and a deleted one", () => {
    const other = "/ws/b.openp41ge-workspace";
    write(other, { ...base, id: "b" });
    changes.touched(other);
    settle();
    files.delete(FILE);
    changes.touched(FILE);
    settle();
    expect(notified).toEqual([other, FILE]);
    // Gone stays gone: no second report.
    changes.touched(FILE);
    settle();
    expect(notified).toEqual([other, FILE]);
  });

  it("stops reporting once stopped", () => {
    write(FILE, { ...base, name: "B" });
    changes.touched(FILE);
    changes.stop();
    settle();
    expect(notified).toEqual([]);
  });
});
