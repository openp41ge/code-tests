/**
 * Unit tests for the extension manifest validation (contract).
 */
import { describe, it, expect } from "vitest";
import {
  extensionManifestSchema,
  parseExtensionManifest,
  isExtensionManifest,
  EXTENSION_API_VERSION,
  type ExtensionManifest,
} from "@openp41ge-sdk/manifest";

const valid: unknown = {
  name: "openp41ge-extension-terminal",
  version: "0.1.0",
  openp41ge: {
    extension: true,
    id: "openp41ge-terminal",
    publisher: "openp41ge",
    entry: "./dist/index.js",
  },
};

describe("extension manifest", () => {
  it("parses a valid manifest and applies the default api version", () => {
    const m = parseExtensionManifest(valid);
    expect(m.name).toBe("openp41ge-extension-terminal");
    expect(m.openp41ge.id).toBe("openp41ge-terminal");
    expect(m.openp41ge.publisher).toBe("openp41ge");
    expect(m.openp41ge.api).toBe(EXTENSION_API_VERSION);
  });

  it("accepts an explicit api version", () => {
    const m = parseExtensionManifest({
      ...valid,
      openp41ge: { ...(valid as ExtensionManifest).openp41ge, api: "0.1" },
    });
    expect(m.openp41ge.api).toBe("0.1");
  });

  it("rejects a manifest without the openp41ge extension block", () => {
    expect(() => parseExtensionManifest({ name: "x", version: "1.0.0" })).toThrow();
    expect(isExtensionManifest({ name: "x", version: "1.0.0" })).toBe(false);
  });

  it("rejects when extension is not the literal true", () => {
    expect(
      isExtensionManifest({
        ...valid,
        openp41ge: { ...(valid as ExtensionManifest).openp41ge, extension: "yes" as never },
      }),
    ).toBe(false);
  });

  it("rejects missing required fields (id / publisher / entry)", () => {
    const base = valid as ExtensionManifest;
    for (const field of ["id", "publisher", "entry"] as const) {
      const bad = {
        ...valid,
        openp41ge: { ...base.openp41ge, [field]: "" },
      };
      expect(isExtensionManifest(bad)).toBe(false);
    }
  });

  it("allows extra fields on the manifest (forward compatibility)", () => {
    const m = parseExtensionManifest({ ...valid, description: "extra", keywords: ["x"] });
    expect(m.name).toBe("openp41ge-extension-terminal");
    expect(extensionManifestSchema.safeParse(m).success).toBe(true);
  });

  it("accepts an optional renderer entry (0.2 renderer-driven assets)", () => {
    const m = parseExtensionManifest({
      ...valid,
      openp41ge: {
        ...(valid as ExtensionManifest).openp41ge,
        renderer: "./dist/renderer.js",
        api: "0.2",
      },
    });
    expect(m.openp41ge.renderer).toBe("./dist/renderer.js");
    expect(m.openp41ge.api).toBe("0.2");
  });

  it("keeps the manifest valid without a renderer entry (legacy 0.1 assets)", () => {
    const m = parseExtensionManifest(valid);
    expect(m.openp41ge.renderer).toBeUndefined();
    expect(extensionManifestSchema.safeParse(m).success).toBe(true);
  });
});
