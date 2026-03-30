import { describe, it, expect } from "bun:test";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fromSpec } from "./openapi";

function writeSpec(spec: object): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "oapi-test-"));
  const path = join(dir, "spec.json");
  writeFileSync(path, JSON.stringify(spec));
  return { path, cleanup: () => rmSync(dir, { recursive: true }) };
}

const petStoreSpec = {
  openapi: "3.0.3",
  info: { title: "Petstore", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/pets": {
      get: {
        summary: "List all pets",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" }, description: "Max results" },
        ],
      },
      post: {
        summary: "Create a pet",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Pet name" },
                  tag: { type: "string" },
                },
                required: ["name"],
              },
            },
          },
        },
      },
    },
    "/pets/{petId}": {
      get: {
        summary: "Get a pet by ID",
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
      },
      delete: {
        summary: "Delete a pet",
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
      },
    },
  },
};

describe("fromSpec", () => {
  it("extracts resources from paths", async () => {
    const { path, cleanup } = writeSpec(petStoreSpec);
    try {
      const resources = await fromSpec(path);
      expect(Object.keys(resources)).toContain("pets");
    } finally {
      cleanup();
    }
  });

  it("extracts actions from HTTP methods", async () => {
    const { path, cleanup } = writeSpec(petStoreSpec);
    try {
      const resources = await fromSpec(path);
      const actions = Object.keys(resources["pets"]!);
      expect(actions).toContain("list");
      expect(actions).toContain("create");
      expect(actions).toContain("get");
      expect(actions).toContain("delete");
    } finally {
      cleanup();
    }
  });

  it("extracts query params", async () => {
    const { path, cleanup } = writeSpec(petStoreSpec);
    try {
      const resources = await fromSpec(path);
      const listCmd = resources["pets"]!["list"]!;
      const limitParam = listCmd.params.find((p) => p.name === "limit");
      expect(limitParam).toBeDefined();
      expect(limitParam!.location).toBe("query");
      expect(limitParam!.kind).toBe("number");
      expect(limitParam!.required).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("extracts path params", async () => {
    const { path, cleanup } = writeSpec(petStoreSpec);
    try {
      const resources = await fromSpec(path);
      const getCmd = resources["pets"]!["get"]!;
      const idParam = getCmd.params.find((p) => p.name === "petId");
      expect(idParam).toBeDefined();
      expect(idParam!.location).toBe("path");
      expect(idParam!.required).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("extracts body params with required flags", async () => {
    const { path, cleanup } = writeSpec(petStoreSpec);
    try {
      const resources = await fromSpec(path);
      const createCmd = resources["pets"]!["create"]!;
      const nameParam = createCmd.params.find((p) => p.name === "name");
      const tagParam = createCmd.params.find((p) => p.name === "tag");
      expect(nameParam).toBeDefined();
      expect(nameParam!.location).toBe("body");
      expect(nameParam!.required).toBe(true);
      expect(tagParam!.required).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("uses summary as description", async () => {
    const { path, cleanup } = writeSpec(petStoreSpec);
    try {
      const resources = await fromSpec(path);
      expect(resources["pets"]!["list"]!.description).toBe("List all pets");
    } finally {
      cleanup();
    }
  });

  it("respects baseUrl option", async () => {
    const { path, cleanup } = writeSpec(petStoreSpec);
    try {
      const resources = await fromSpec(path, { baseUrl: "https://custom.api.com" });
      expect(resources["pets"]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("accepts a spec object directly", async () => {
    const resources = await fromSpec(petStoreSpec);
    const actions = Object.keys(resources["pets"]!);
    expect(actions).toContain("list");
    expect(actions).toContain("create");
  });

  it("rejects non-OpenAPI input", async () => {
    const { path, cleanup } = writeSpec({ foo: "bar" });
    try {
      await expect(fromSpec(path)).rejects.toThrow("not a valid OpenAPI spec");
    } finally {
      cleanup();
    }
  });

  it("resolves $ref in request body schemas", async () => {
    const spec = {
      openapi: "3.0.3",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/items": {
          post: {
            summary: "Create item",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CreateItem" },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          CreateItem: {
            type: "object",
            properties: {
              title: { type: "string" },
              count: { type: "integer" },
            },
            required: ["title"],
          },
        },
      },
    };
    const { path, cleanup } = writeSpec(spec);
    try {
      const resources = await fromSpec(path);
      const cmd = resources["items"]!["create"]!;
      expect(cmd.params.find((p) => p.name === "title")!.required).toBe(true);
      expect(cmd.params.find((p) => p.name === "count")!.kind).toBe("number");
    } finally {
      cleanup();
    }
  });
});
