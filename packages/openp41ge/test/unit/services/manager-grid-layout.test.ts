/**
 * The manager window's saved grid: what it records of the open tabs, and
 * reading it back (anything malformed is dropped, never thrown).
 */
import { describe, it, expect } from "vitest";
import {
  parseManagerGrid,
  serializeManagerGrid,
} from "@openp41ge/renderer/services/manager-grid-layout";

const tabs = [
  { id: "a", appType: "ext:w:editor", title: "Alpha", config: { path: "/w/a" }, pinned: true },
  { id: "b", appType: "ext:w:editor", title: "Beta", icon: "<svg/>", config: { path: "/w/b" } },
  { id: "c", appType: "settings", title: "Settings", config: {}, pinned: false },
];
const placements = [
  { tabIds: ["a", "b"], activeTabId: "b" },
  { tabIds: ["c"], activeTabId: "c" },
];

describe("serializeManagerGrid", () => {
  it("records each column's tabs in order and which is active", () => {
    expect(serializeManagerGrid(placements, tabs)).toEqual({
      version: 1,
      columns: [
        {
          tabs: [
            { appType: "ext:w:editor", title: "Alpha", config: { path: "/w/a" }, pinned: true },
            {
              appType: "ext:w:editor",
              title: "Beta",
              icon: "<svg/>",
              config: { path: "/w/b" },
              pinned: false,
            },
          ],
          active: 1,
        },
        {
          tabs: [{ appType: "settings", title: "Settings", config: {}, pinned: false }],
          active: 0,
        },
      ],
    });
  });
});

describe("parseManagerGrid", () => {
  it("reads back what was saved", () => {
    const saved = serializeManagerGrid(placements, tabs);
    expect(parseManagerGrid(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("drops malformed tabs and empty columns, and clamps the active index", () => {
    expect(
      parseManagerGrid({
        version: 1,
        columns: [
          { tabs: [{ appType: "x", title: "X", config: {} }, { title: "no type" }], active: 5 },
          { tabs: [], active: 0 },
          "junk",
        ],
      }),
    ).toEqual({
      version: 1,
      columns: [{ tabs: [{ appType: "x", title: "X", config: {}, pinned: false }], active: 0 }],
    });
  });

  it("is null for anything else", () => {
    expect(parseManagerGrid(null)).toBeNull();
    expect(parseManagerGrid({ version: 2, columns: [] })).toBeNull();
    expect(parseManagerGrid({ version: 1 })).toBeNull();
  });
});
