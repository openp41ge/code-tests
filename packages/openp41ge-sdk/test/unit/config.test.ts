/**
 * Unit tests for the extension config contract: the schema an extension
 * registers (`registerConfigSchema`), the defaults it gives, validation of the
 * user's values against it, and the merge the platform hands back.
 */
import { describe, it, expect } from "vitest";
import {
  configDefaults,
  configErrors,
  mergeConfig,
  registerConfigSchema,
  validateConfigSchema,
  type ConfigSchema,
} from "@openp41ge-sdk";
import { beginExtensionScope, endExtensionScope, getScopedConfigSchema } from "./scope-helper";

const SCHEMA: ConfigSchema = {
  type: "object",
  properties: {
    model: { type: "string", default: "qwen" },
    temperature: { type: "number", minimum: 0, maximum: 2, default: 0.7 },
    mode: { type: "string", enum: ["chat", "agent"], default: "agent" },
    tools: { type: "array", items: { type: "string" }, default: ["read"] },
    endpoint: {
      type: "object",
      properties: {
        baseUrl: { type: "string", default: "http://localhost:8000" },
        apiKey: { type: "string" },
      },
      additionalProperties: false,
    },
    note: { type: "string" },
  },
};

describe("configDefaults", () => {
  it("collects every default, nested objects included", () => {
    expect(configDefaults(SCHEMA)).toEqual({
      model: "qwen",
      temperature: 0.7,
      mode: "agent",
      tools: ["read"],
      endpoint: { baseUrl: "http://localhost:8000" },
    });
  });

  it("prefers an object's own default over its properties' defaults", () => {
    const schema: ConfigSchema = {
      type: "object",
      properties: {
        a: { type: "object", default: { x: 1 }, properties: { x: { type: "number", default: 2 } } },
      },
    };
    expect(configDefaults(schema)).toEqual({ a: { x: 1 } });
  });

  it("returns copies, so a caller cannot change the schema's defaults", () => {
    const d = configDefaults(SCHEMA);
    (d.tools as string[]).push("write");
    expect(configDefaults(SCHEMA).tools).toEqual(["read"]);
  });
});

describe("configErrors", () => {
  it("accepts values that match", () => {
    expect(
      configErrors(SCHEMA, { model: "x", temperature: 1, endpoint: { apiKey: "k" }, extra: 1 }),
    ).toEqual([]);
  });

  it("names the path and the problem of each mismatch", () => {
    expect(
      configErrors(SCHEMA, {
        model: 3,
        temperature: 5,
        mode: "other",
        tools: ["read", 2],
        endpoint: { baseUrl: "u", port: 80 },
      }),
    ).toEqual([
      "model: expected string",
      "temperature: must be at most 2",
      'mode: must be one of "chat", "agent"',
      "tools[1]: expected string",
      "endpoint.port: is not allowed",
    ]);
  });

  it("accepts any of a list of types", () => {
    const schema: ConfigSchema = {
      type: "object",
      properties: { effort: { type: ["string", "null"] } },
    };
    expect(configErrors(schema, { effort: null })).toEqual([]);
    expect(configErrors(schema, { effort: "high" })).toEqual([]);
    expect(configErrors(schema, { effort: 1 })).toEqual(["effort: expected string or null"]);
    expect(validateConfigSchema(schema)).toBe(schema);
    expect(() =>
      validateConfigSchema({ type: "object", properties: { a: { type: ["string", "text"] } } }),
    ).toThrow(/a: unknown type "text"/);
  });

  it("checks required properties and integers", () => {
    const schema: ConfigSchema = {
      type: "object",
      required: ["n"],
      properties: { n: { type: "integer", minimum: 1 } },
    };
    expect(configErrors(schema, {})).toEqual(["n: is required"]);
    expect(configErrors(schema, { n: 1.5 })).toEqual(["n: expected integer"]);
    expect(configErrors(schema, { n: 0 })).toEqual(["n: must be at least 1"]);
  });

  it("rejects a non-object document", () => {
    expect(configErrors(SCHEMA, [])).toEqual(["expected object"]);
  });
});

describe("mergeConfig", () => {
  it("deep-merges objects and replaces arrays and leaves", () => {
    const merged = mergeConfig(configDefaults(SCHEMA), {
      temperature: 0.2,
      tools: ["write"],
      endpoint: { apiKey: "k" },
    });
    expect(merged).toEqual({
      model: "qwen",
      temperature: 0.2,
      mode: "agent",
      tools: ["write"],
      endpoint: { baseUrl: "http://localhost:8000", apiKey: "k" },
    });
  });

  it("does not change its inputs", () => {
    const defaults = { a: { b: 1 } };
    mergeConfig(defaults, { a: { c: 2 } });
    expect(defaults).toEqual({ a: { b: 1 } });
  });
});

describe("validateConfigSchema", () => {
  it("accepts a well-formed schema", () => {
    expect(validateConfigSchema(SCHEMA)).toBe(SCHEMA);
  });

  it("requires an object schema at the root", () => {
    expect(() => validateConfigSchema({ type: "string" })).toThrow(/root must be an object/);
    expect(() => validateConfigSchema(null)).toThrow(/root must be an object/);
  });

  it("rejects an unknown type", () => {
    expect(() =>
      validateConfigSchema({ type: "object", properties: { a: { type: "text" } } }),
    ).toThrow(/a: unknown type "text"/);
  });

  it("rejects a default that does not match its own schema", () => {
    expect(() =>
      validateConfigSchema({ type: "object", properties: { a: { type: "number", default: "1" } } }),
    ).toThrow(/a: default: expected number/);
  });

  it("rejects malformed properties, items and required", () => {
    expect(() => validateConfigSchema({ type: "object", properties: [] })).toThrow(
      /properties must be an object/,
    );
    expect(() =>
      validateConfigSchema({ type: "object", properties: { a: { type: "array", items: 1 } } }),
    ).toThrow(/a: items must be a schema/);
    expect(() => validateConfigSchema({ type: "object", required: "a" })).toThrow(
      /required must be a list of names/,
    );
  });
});

describe("registerConfigSchema", () => {
  it("throws when called outside an extension scope", () => {
    expect(() => registerConfigSchema(SCHEMA)).toThrow(/outside an extension scope/);
  });

  it("captures the schema against the open scope", () => {
    beginExtensionScope("ext-a", "1.0.0");
    try {
      registerConfigSchema(SCHEMA);
      expect(getScopedConfigSchema()).toBe(SCHEMA);
    } finally {
      endExtensionScope();
    }
  });

  it("throws on an invalid schema or a second registration", () => {
    beginExtensionScope("ext-a", "1.0.0");
    try {
      expect(() => registerConfigSchema({ type: "string" } as ConfigSchema)).toThrow(
        /root must be an object/,
      );
      registerConfigSchema(SCHEMA);
      expect(() => registerConfigSchema(SCHEMA)).toThrow(/already registered/);
    } finally {
      endExtensionScope();
    }
  });
});

describe("x-keysOf: a string that names a key of a sibling map", () => {
  const schema = {
    type: "object",
    properties: {
      defaultHost: { type: "string", "x-keysOf": "hosts" },
      hosts: { type: "object", additionalProperties: { type: "object" } },
    },
  } as const;

  it("is valid when it names a key, or the map is absent", () => {
    expect(configErrors(schema, { defaultHost: "a", hosts: { a: {} } })).toEqual([]);
    expect(configErrors(schema, { defaultHost: "a" })).toEqual([]);
  });

  it("is an error when it names no key", () => {
    expect(configErrors(schema, { defaultHost: "z", hosts: { a: {}, b: {} } })).toEqual([
      'defaultHost: must be one of the keys of hosts ("a", "b")',
    ]);
  });

  it("a schema whose x-keysOf names no sibling property is refused", () => {
    expect(() =>
      validateConfigSchema({
        type: "object",
        properties: { d: { type: "string", "x-keysOf": "nope" } },
      }),
    ).toThrow(/x-keysOf/);
  });
});
