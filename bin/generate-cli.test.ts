import { describe, it, expect } from "bun:test";
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function writeSpec(spec: object): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "umbra-cli-test-"));
  const path = join(dir, "spec.json");
  writeFileSync(path, JSON.stringify(spec));
  return { path, cleanup: () => rmSync(dir, { recursive: true }) };
}

describe("generateSpecModule deduplicates export names", () => {
  it("does not produce duplicate export const names across resources", async () => {
    const spec = {
      openapi: "3.0.3",
      info: { title: "Test", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/projects/{id}": {
          get: {
            operationId: "get",
            summary: "Get project by ID",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          },
        },
        "/team-roles/{id}": {
          get: {
            operationId: "get",
            summary: "Get team role by ID",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          },
        },
      },
    };

    const { path: specPath, cleanup } = writeSpec(spec);
    const outFile = join(tmpdir(), `cli-gen-${Date.now()}.ts`);

    try {
      const proc = Bun.spawn({
        cmd: ["bun", "run", "bin/generate-cli.ts", "--openapi", specPath, "--out", outFile],
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const generated = readFileSync(outFile, "utf-8");

      const exports = [...generated.matchAll(/export const (\w+): CliCommand = \{/g)].map(
        (m) => m[1],
      );

      // First operation uses its operationId
      expect(exports).toContain("get");
      // Second operation with same operationId gets resource-prefixed name
      expect(exports).toContain("teamRolesGet");
      expect(exports).not.toContain("get_1");
      expect(new Set(exports).size).toBe(exports.length);
    } finally {
      cleanup();
      try {
        rmSync(outFile);
      } catch {
        // ignore
      }
    }
  });

  it("handles auto-derived name collisions when no operationId is specified", async () => {
    // This spec has no operationIds, so names are auto-derived from resource+action
    // Both "/workspaces/{id}" and "/workspaces/{id}/items" would generate "getWorkspaces" for their get operations
    const spec = {
      openapi: "3.0.3",
      info: { title: "Test", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/workspaces/{id}": {
          get: {
            summary: "Get workspace by ID",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          },
        },
        "/workspaces/{id}/items": {
          get: {
            summary: "Get items for a workspace",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          },
        },
      },
    };

    const { path: specPath, cleanup } = writeSpec(spec);
    const outFile = join(tmpdir(), `cli-gen-${Date.now()}.ts`);

    try {
      const proc = Bun.spawn({
        cmd: ["bun", "run", "bin/generate-cli.ts", "--openapi", specPath, "--out", outFile],
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const generated = readFileSync(outFile, "utf-8");

      const exports = [...generated.matchAll(/export const (\w+): CliCommand = \{/g)].map(
        (m) => m[1],
      );

      // First: workspaces (resource) + get (action) -> workspacesGet
      // Second: workspaces (resource) + items (action from path) -> workspacesItems
      expect(exports).toContain("workspacesGet");
      expect(exports).toContain("workspacesItems");
      expect(new Set(exports).size).toBe(exports.length);
    } finally {
      cleanup();
      try {
        rmSync(outFile);
      } catch {
        // ignore
      }
    }
  });
});
