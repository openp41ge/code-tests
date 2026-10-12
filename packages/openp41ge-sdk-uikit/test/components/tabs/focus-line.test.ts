/**
 * The focus line on a tab handle (the focused tab): a blue bar across the
 * top, half the tab's width and centred, 3px thick with rounded ends. One
 * rule, shared by every tab bar.
 */
import { describe, test } from "vitest";
import { tabFocusLineCss } from "../../../src/components/tabs/focus-line";
import { expectFocusLine } from "./focus-line-expect";

describe("tab focus line", () => {
  test("is half the tab's width, centred, 3px with rounded ends", () => {
    expectFocusLine(tabFocusLineCss(".tab-btn"), ".tab-btn");
  });
});
