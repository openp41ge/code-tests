/**
 * Tests for the shared command/topic vocabulary (namespacing).
 */
import { describe, it, expect } from "vitest";
import { EXTENSION_ID_SEPARATOR, qualifyName } from "openp41ge-sdk";

describe("qualifyName", () => {
  it("qualifies a name under an extension id", () => {
    expect(qualifyName("explorer", "read-dir")).toBe("explorer/read-dir");
  });

  it("strips leading slashes from the name", () => {
    expect(qualifyName("explorer", "/read-dir")).toBe("explorer/read-dir");
  });

  it("keeps the extension id untouched", () => {
    expect(qualifyName("openp41ge-extension-explorer", "open-file")).toBe(
      "openp41ge-extension-explorer/open-file",
    );
  });

  it("exposes the separator constant", () => {
    expect(EXTENSION_ID_SEPARATOR).toBe("/");
  });
});
