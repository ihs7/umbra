import { describe, it, expect } from "bun:test";
import { createValidator } from "./validate";

describe("createValidator", () => {
  it("passes valid object", () => {
    const v = createValidator({});
    const errors = v.validate(
      { name: "Rex", age: 3 },
      {
        type: "object",
        properties: { name: { type: "string" }, age: { type: "integer" } },
        required: ["name"],
      },
    );
    expect(errors).toEqual([]);
  });

  it("catches missing required property", () => {
    const v = createValidator({});
    const errors = v.validate(
      { age: 3 },
      {
        type: "object",
        properties: { name: { type: "string" }, age: { type: "integer" } },
        required: ["name"],
      },
    );
    expect(errors).toEqual(["$.name: required property missing"]);
  });

  it("catches type mismatch", () => {
    const v = createValidator({});
    const errors = v.validate("hello", { type: "number" });
    expect(errors).toEqual(["$: expected number, got string"]);
  });

  it("catches integer vs float", () => {
    const v = createValidator({});
    const errors = v.validate(3.5, { type: "integer" });
    expect(errors).toEqual(["$: expected integer, got number"]);
  });

  it("passes valid integer", () => {
    const v = createValidator({});
    expect(v.validate(3, { type: "integer" })).toEqual([]);
  });

  it("validates nested objects", () => {
    const v = createValidator({});
    const errors = v.validate(
      { owner: { name: 42 } },
      {
        type: "object",
        properties: {
          owner: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
      },
    );
    expect(errors).toEqual(["$.owner.name: expected string, got number"]);
  });

  it("validates array items", () => {
    const v = createValidator({});
    const errors = v.validate([1, "two", 3], {
      type: "array",
      items: { type: "number" },
    });
    expect(errors).toEqual(["$[1]: expected number, got string"]);
  });

  it("resolves $ref", () => {
    const v = createValidator({
      Pet: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    });
    const errors = v.validate({}, { $ref: "#/components/schemas/Pet" });
    expect(errors).toEqual(["$.name: required property missing"]);
  });

  it("handles nullable", () => {
    const v = createValidator({});
    const errors = v.validate(null, { type: "string", nullable: true });
    expect(errors).toEqual([]);
  });

  it("validates enum values", () => {
    const v = createValidator({});
    const errors = v.validate("cat", { type: "string", enum: ["dog", "bird"] });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("not in enum");
  });

  it("returns empty for undefined schema", () => {
    const v = createValidator({});
    expect(v.validate({ anything: true }, undefined)).toEqual([]);
  });

  it("validates allOf", () => {
    const v = createValidator({});
    const errors = v.validate(
      { name: "Rex" },
      {
        allOf: [
          { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          { type: "object", properties: { age: { type: "number" } }, required: ["age"] },
        ],
      },
    );
    expect(errors).toEqual(["$.age: required property missing"]);
  });

  it("validates anyOf", () => {
    const v = createValidator({});
    const errors = v.validate("hello", {
      anyOf: [{ type: "number" }, { type: "boolean" }],
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("anyOf");
  });

  it("passes valid anyOf", () => {
    const v = createValidator({});
    const errors = v.validate(42, {
      anyOf: [{ type: "number" }, { type: "string" }],
    });
    expect(errors).toEqual([]);
  });
});
