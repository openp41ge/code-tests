/**
 * Unit tests for the renderer-driven registration surface (contract).
 */
import { describe, it, expect } from "vitest";
import {
  beginExtensionScope,
  endExtensionScope,
  getScopedProcesses,
  getScopedRenderers,
  getScopedDisposers,
} from "./scope-helper";
import {
  registerDispose,
  registerProcesses,
  registerRenderers,
  type SurfaceSpec,
} from "@openp41ge-sdk";

function renderStub() {
  // Renderer functions are pure functions of state; here we only need a value
  // that satisfies the type at runtime.
  return {} as unknown as ReturnType<import("@openp41ge-sdk").RendererFn>;
}

describe("registerProcesses", () => {
  it("throws when called outside an extension scope", () => {
    expect(() => registerProcesses({ "x/y": () => undefined })).toThrow(
      /outside an extension scope/,
    );
  });

  it("captures handlers against the open scope", () => {
    beginExtensionScope("ext-a", "1.0.0");
    try {
      registerProcesses({
        "ext-a/read": () => ({ ok: true }),
        "ext-a/write": () => undefined,
      });
      const handlers = getScopedProcesses();
      expect(handlers).not.toBeNull();
      expect(handlers!.size).toBe(2);
      expect(handlers!.has("ext-a/read")).toBe(true);
      expect(handlers!.get("ext-a/write")).toBeInstanceOf(Function);
    } finally {
      endExtensionScope();
    }
  });

  it("merges repeated registrations of the same command id", () => {
    beginExtensionScope("ext-a", "1.0.0");
    try {
      registerProcesses({ "ext-a/read": () => 1 });
      registerProcesses({ "ext-a/read": () => 2 });
      expect(getScopedProcesses()!.get("ext-a/read")).toBeInstanceOf(Function);
      expect(getScopedProcesses()!.size).toBe(1);
    } finally {
      endExtensionScope();
    }
  });
});

describe("registerRenderers", () => {
  const surfaces: SurfaceSpec[] = [
    { kind: "grid", id: "dashboard", title: "Dashboard", render: renderStub },
    {
      kind: "sidebar",
      id: "explorer",
      title: "Explorer",
      defaultSide: "left",
      render: renderStub,
    },
  ];

  it("throws when called outside an extension scope", () => {
    expect(() => registerRenderers(surfaces)).toThrow(/outside an extension scope/);
  });

  it("captures surfaces against the open scope", () => {
    beginExtensionScope("ext-a", "1.0.0");
    try {
      registerRenderers(surfaces);
      const captured = getScopedRenderers();
      expect(captured).not.toBeNull();
      expect(captured!.length).toBe(2);
      expect(captured![0]).toMatchObject({ kind: "grid", id: "dashboard", title: "Dashboard" });
      expect(captured![1]).toMatchObject({ kind: "sidebar", id: "explorer", defaultSide: "left" });
    } finally {
      endExtensionScope();
    }
  });

  it("appends surfaces across multiple calls", () => {
    beginExtensionScope("ext-a", "1.0.0");
    try {
      registerRenderers([surfaces[0]]);
      registerRenderers([surfaces[1]]);
      expect(getScopedRenderers()!.length).toBe(2);
    } finally {
      endExtensionScope();
    }
  });
});

describe("registerDispose", () => {
  it("throws when called outside an extension scope", () => {
    expect(() => registerDispose(() => undefined)).toThrow(/outside an extension scope/);
  });

  it("captures disposers against the open scope, in order", () => {
    beginExtensionScope("ext-a", "1.0.0");
    try {
      const a = () => undefined;
      const b = () => undefined;
      registerDispose(a);
      registerDispose(b);
      expect(getScopedDisposers()).toEqual([a, b]);
    } finally {
      endExtensionScope();
    }
  });
});
