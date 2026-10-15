/**
 * form-model — the pure half of <json-form>: a config schema, the user's
 * values, the defaults and the errors become field descriptors (one per
 * property, in schema order, required-and-unset first); edits become new
 * user values.
 */
import { describe, it, expect } from "vitest";
import {
  formFields,
  setFieldValue,
  resetField,
  type FormField,
} from "../../src/json-form/form-model";

const byName = (fields: FormField[], name: string) => fields.find((f) => f.name === name)!;

describe("formFields: readOnly", () => {
  it("marks a readOnly property, which may still be set", () => {
    const f = formFields(
      {
        type: "object",
        properties: {
          old: { type: "string", enum: ["x"], readOnly: true },
          on: { type: "boolean" },
        },
      },
      { old: "x" },
      {},
    );
    expect(byName(f, "old")).toMatchObject({ readOnly: true, set: true, value: "x" });
    expect(byName(f, "on").readOnly).toBeUndefined();
  });
});

describe("formFields: one field per property, by its schema", () => {
  const schema = {
    type: "object",
    properties: {
      on: { type: "boolean", default: true },
      size: { type: "integer", minimum: 1, maximum: 9, default: 3 },
      ratio: { type: "number" },
      mode: { enum: ["a", "b"], default: "a" },
      name: { type: "string", title: "Display name", description: "Shown **bold**" },
      token: { type: "string", secret: true },
      tags: { type: "array", items: { type: "string" } },
      levels: { type: "array", items: { enum: ["low", "high"] } },
      hosts: {
        type: "array",
        items: { type: "object", properties: { url: { type: "string" } } },
      },
      nested: {
        type: "object",
        properties: { depth: { type: "integer", default: 2 } },
      },
      either: { type: ["string", "number"] },
      map: { type: "object", additionalProperties: { type: "string" } },
      grid: { type: "array", items: { type: "array" } },
      anything: {},
    },
  };

  const fields = formFields(schema, {}, { on: true, size: 3, mode: "a", nested: { depth: 2 } });

  it("keeps schema order", () => {
    expect(fields.map((f) => f.name)).toEqual(Object.keys(schema.properties));
  });

  it("maps each schema kind to its field kind", () => {
    expect(fields.map((f) => [f.name, f.kind])).toEqual([
      ["on", "boolean"],
      ["size", "number"],
      ["ratio", "number"],
      ["mode", "enum"],
      ["name", "string"],
      ["token", "secret"],
      ["tags", "list"],
      ["levels", "list"],
      ["hosts", "objects"],
      ["nested", "group"],
      ["either", "unsupported"],
      ["map", "map"],
      ["grid", "unsupported"],
      ["anything", "unsupported"],
    ]);
  });

  it("carries a number's bounds and integer step, an enum's options, a list's item kind", () => {
    expect(byName(fields, "size")).toMatchObject({ integer: true, minimum: 1, maximum: 9 });
    expect(byName(fields, "ratio").integer).toBe(false);
    expect(byName(fields, "mode").options).toEqual(["a", "b"]);
    expect(byName(fields, "tags").item).toEqual({ kind: "string", integer: false });
    expect(byName(fields, "levels").item).toEqual({
      kind: "enum",
      integer: false,
      options: ["low", "high"],
    });
  });

  it("labels from the title, else the key; keeps the description", () => {
    expect(byName(fields, "name")).toMatchObject({
      label: "Display name",
      description: "Shown **bold**",
    });
    expect(byName(fields, "on")).toMatchObject({ label: "on", description: null });
  });

  it("nests an object's fields under its group, with their full paths", () => {
    const group = byName(fields, "nested");
    expect(group.fields!.map((f) => [f.key, f.kind, f.value])).toEqual([
      ["nested.depth", "number", 2],
    ]);
  });
});

describe("formFields: values, defaults, required", () => {
  const schema = {
    type: "object",
    required: ["apiKey"],
    properties: {
      size: { type: "integer", default: 3 },
      label: { type: "string" },
      apiKey: { type: "string", secret: true },
      color: { type: "string", default: "red" },
    },
  };

  it("shows the default when unset, the user's value when set", () => {
    const fields = formFields(schema, { size: 5 }, { size: 3, color: "red" });
    expect(byName(fields, "size")).toMatchObject({ value: 5, set: true, hasDefault: true });
    expect(byName(fields, "color")).toMatchObject({ value: "red", set: false, hasDefault: true });
    expect(byName(fields, "label")).toMatchObject({
      value: undefined,
      set: false,
      hasDefault: false,
    });
  });

  it("a value equal to its default is still set (pinned)", () => {
    const fields = formFields(schema, { color: "red" }, { size: 3, color: "red" });
    expect(byName(fields, "color")).toMatchObject({ value: "red", set: true });
  });

  it("puts required settings without a default first, marked", () => {
    const fields = formFields(schema, {}, { size: 3, color: "red" });
    expect(fields.map((f) => f.name)).toEqual(["apiKey", "size", "label", "color"]);
    expect(byName(fields, "apiKey").required).toBe(true);
    expect(byName(fields, "size").required).toBe(false);
  });
});

describe("formFields: lists of objects", () => {
  const schema = {
    type: "object",
    properties: {
      hosts: {
        type: "array",
        items: {
          type: "object",
          properties: { url: { type: "string" }, port: { type: "integer", default: 80 } },
        },
        default: [{ url: "a.example" }],
      },
    },
  };

  it("one group of fields per item, from the user's list", () => {
    const [hosts] = formFields(schema, { hosts: [{ url: "x" }, { url: "y", port: 8 }] }, {});
    expect(hosts.set).toBe(true);
    expect(hosts.items!.map((item) => item.map((f) => [f.key, f.value]))).toEqual([
      [
        ["hosts[0].url", "x"],
        ["hosts[0].port", undefined],
      ],
      [
        ["hosts[1].url", "y"],
        ["hosts[1].port", 8],
      ],
    ]);
  });

  it("from the default list when the user has none", () => {
    const [hosts] = formFields(schema, {}, { hosts: [{ url: "a.example" }] });
    expect(hosts.set).toBe(false);
    expect(hosts.items!.map((item) => item[0].value)).toEqual(["a.example"]);
  });
});

describe("formFields: errors", () => {
  const schema = {
    type: "object",
    properties: {
      size: { type: "integer", minimum: 1, default: 3 },
      nested: { type: "object", properties: { depth: { type: "integer" } } },
    },
  };

  it("attaches each error to the field at its path", () => {
    const fields = formFields(schema, { size: 0, nested: { depth: "x" } }, { size: 3 }, [
      { path: "size", message: "size: must be at least 1" },
      { path: "nested.depth", message: "nested.depth: expected integer" },
    ]);
    expect(byName(fields, "size")).toMatchObject({ value: 0, error: "size: must be at least 1" });
    expect(byName(fields, "nested").fields![0]).toMatchObject({
      value: "x",
      error: "nested.depth: expected integer",
    });
  });
});

describe("setFieldValue / resetField: edits as new user values", () => {
  it("sets a value, creating the objects on its path", () => {
    expect(setFieldValue({}, {}, ["nested", "depth"], 4)).toEqual({ nested: { depth: 4 } });
  });

  it("does not change the value it was given", () => {
    const user = { a: 1 };
    setFieldValue(user, {}, ["a"], 2);
    expect(user).toEqual({ a: 1 });
  });

  it("editing an item of a default list sets the whole list first", () => {
    const defaults = { hosts: [{ url: "a" }, { url: "b" }] };
    expect(setFieldValue({}, defaults, ["hosts", 1, "url"], "c")).toEqual({
      hosts: [{ url: "a" }, { url: "c" }],
    });
  });

  it("reset removes the user's value, and objects it leaves empty", () => {
    expect(resetField({ nested: { depth: 4 }, a: 1 }, ["nested", "depth"])).toEqual({ a: 1 });
    expect(resetField({ a: 1, b: 2 }, ["a"])).toEqual({ b: 2 });
  });

  it("reset of an unset path changes nothing", () => {
    expect(resetField({ a: 1 }, ["b", "c"])).toEqual({ a: 1 });
  });
});

describe("formFields: maps (an object whose keys are the user's)", () => {
  const schema = {
    type: "object",
    properties: {
      defaultHost: { type: "string", "x-keysOf": "hosts", default: "a" },
      hosts: {
        type: "object",
        default: { a: { url: "a.example" } },
        additionalProperties: {
          type: "object",
          properties: { url: { type: "string" }, port: { type: "integer" } },
        },
      },
      levels: { type: "object", additionalProperties: { type: ["string", "null"] } },
    },
  };
  const defaults = { defaultHost: "a", hosts: { a: { url: "a.example" } } };

  it("one entry per key, the defaults' and the user's merged; edits by the value's schema", () => {
    const fields = formFields(
      schema,
      { hosts: { a: { port: 8 }, b: { url: "b.example" } } },
      defaults,
    );
    const hosts = byName(fields, "hosts");
    expect(hosts.kind).toBe("map");
    expect(hosts.entries!.map((e) => [e.name, e.kind])).toEqual([
      ["a", "group"],
      ["b", "group"],
    ]);
    expect(hosts.defaultKeys).toEqual(["a"]);
    // A new entry's shape: its value schema's property count.
    expect(hosts.entryProperties).toBe(2);
    expect(hosts.entries![0].fields!.map((f) => [f.key, f.value, f.set])).toEqual([
      ["hosts.a.url", "a.example", false],
      ["hosts.a.port", 8, true],
    ]);
  });

  it("a nullable string value is a string field that can be null", () => {
    const [, , levels] = formFields(schema, { levels: { Off: null, Low: "low" } }, defaults);
    expect(levels.entries!.map((e) => [e.name, e.kind, e.nullable, e.value])).toEqual([
      ["Off", "string", true, null],
      ["Low", "string", true, "low"],
    ]);
  });

  it("x-keysOf: a menu of the sibling map's keys; the map marks the one it names", () => {
    const fields = formFields(schema, { hosts: { b: {} } }, defaults);
    expect(byName(fields, "defaultHost")).toMatchObject({ kind: "enum", options: ["a", "b"] });
    expect(byName(fields, "hosts").marked).toEqual({
      key: "a",
      path: ["defaultHost"],
      label: "defaultHost",
    });
  });

  it("x-keysOf keeps a value that is not a key among the options (the host reports it)", () => {
    const fields = formFields(schema, { defaultHost: "gone" }, defaults);
    expect(byName(fields, "defaultHost").options).toEqual(["a", "gone"]);
  });

  it("reset keeps a map's entry even when it is left empty", () => {
    const user = { hosts: { b: { url: "b.example" } } };
    expect(resetField(user, ["hosts", "b", "url"], [["hosts"]])).toEqual({ hosts: { b: {} } });
    expect(resetField(user, ["hosts", "b", "url"])).toEqual({});
  });
});
