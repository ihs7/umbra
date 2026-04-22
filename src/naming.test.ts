import { describe, it, expect } from "bun:test";
import { safeIdentifier, toCamel, toKebab, toSnake, formatName, findMatch } from "./naming";

describe("safeIdentifier", () => {
  it("returns the name unchanged for non-reserved words", () => {
    expect(safeIdentifier("listPets")).toBe("listPets");
    expect(safeIdentifier("createUser")).toBe("createUser");
    expect(safeIdentifier("foo")).toBe("foo");
  });

  it("appends underscore to JavaScript reserved words", () => {
    expect(safeIdentifier("delete")).toBe("delete_");
    expect(safeIdentifier("class")).toBe("class_");
    expect(safeIdentifier("const")).toBe("const_");
    expect(safeIdentifier("return")).toBe("return_");
    expect(safeIdentifier("await")).toBe("await_");
  });

  it("is case-sensitive", () => {
    expect(safeIdentifier("Delete")).toBe("Delete");
    expect(safeIdentifier("Class")).toBe("Class");
  });
});

describe("toKebab", () => {
  it("converts camelCase to kebab-case", () => {
    expect(toKebab("helloWorld")).toBe("hello-world");
  });

  it("converts snake_case to kebab-case", () => {
    expect(toKebab("hello_world")).toBe("hello-world");
  });
});

describe("toCamel", () => {
  it("converts kebab-case to camelCase", () => {
    expect(toCamel("hello-world")).toBe("helloWorld");
  });

  it("converts snake_case to camelCase", () => {
    expect(toCamel("hello_world")).toBe("helloWorld");
  });
});

describe("toSnake", () => {
  it("converts camelCase to snake_case", () => {
    expect(toSnake("helloWorld")).toBe("hello_world");
  });

  it("converts kebab-case to snake_case", () => {
    expect(toSnake("hello-world")).toBe("hello_world");
  });
});

describe("formatName", () => {
  it("formats as kebab by default", () => {
    expect(formatName("helloWorld", "kebab")).toBe("hello-world");
  });

  it("formats as camel", () => {
    expect(formatName("hello-world", "camel")).toBe("helloWorld");
  });

  it("formats as snake", () => {
    expect(formatName("hello-world", "snake")).toBe("hello_world");
  });
});

describe("findMatch", () => {
  it("finds a matching key by formatted name", () => {
    const map = { helloWorld: 1 };
    expect(findMatch(map, "hello-world", "kebab")).toEqual(["helloWorld", 1]);
    expect(findMatch(map, "helloWorld", "camel")).toEqual(["helloWorld", 1]);
  });

  it("returns undefined when no match is found", () => {
    expect(findMatch({ foo: 1 }, "bar", "kebab")).toBeUndefined();
  });
});
