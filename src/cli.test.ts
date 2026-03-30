import { describe, it, expect, mock } from "bun:test";
import { z } from "zod";
import { createCli } from "./cli";
import { fromSdk } from "./sdk";

const playerSchema = z.object({
  path: z.object({ id: z.string() }),
  query: z.object({ verbose: z.boolean().optional() }),
});

const listPlayersSchema = z.object({
  query: z.object({ limit: z.number().optional() }),
});

function makeOutput() {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    formatter: {
      print: (...args: unknown[]) => lines.push(args.join(" ")),
      error: (...args: unknown[]) => errors.push(args.join(" ")),
      output(data: Record<string, unknown>[], format: string) {
        lines.push(JSON.stringify({ data, format }));
      },
    },
  };
}

function makeCli(out: ReturnType<typeof makeOutput>) {
  return createCli({ name: "mycli", version: "1.2.3", formatter: out.formatter });
}

describe("--version", () => {
  it("prints version", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    await cli.run(["--version"]);
    expect(out.lines[0]).toBe("1.2.3");
  });
});

describe("--help (root)", () => {
  it("lists resources", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, async () => ({ data: { id: "1" } }), "Get a player"),
    });
    await cli.run(["--help"]);
    expect(out.lines.some((l) => l.includes("players"))).toBe(true);
  });
});

describe("resource --help", () => {
  it("lists actions for the resource", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, async () => ({ data: { id: "1" } }), "Get a player"),
      list: fromSdk(listPlayersSchema, async () => ({ data: { results: [] } }), "List players"),
    });
    await cli.run(["players", "--help"]);
    expect(out.lines.some((l) => l.includes("get"))).toBe(true);
    expect(out.lines.some((l) => l.includes("list"))).toBe(true);
  });
});

describe("action --help", () => {
  it("shows flags for the action", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, async () => ({ data: { id: "1" } }), "Get a player"),
    });
    await cli.run(["players", "get", "--help"]);
    expect(out.lines.some((l) => l.includes("--id"))).toBe(true);
  });
});

describe("successful command", () => {
  it("calls handler with parsed args and outputs yaml by default", async () => {
    const handler = mock(async () => ({ data: { id: "42", name: "Alice" } }));
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, handler, "Get a player"),
    });
    await cli.run(["players", "get", "--id", "42"]);
    expect(handler).toHaveBeenCalledWith({ path: { id: "42" } });
    const parsed = JSON.parse(out.lines[0]!);
    expect(parsed.format).toBe("yaml");
    expect(parsed.data[0]).toEqual({ id: "42", name: "Alice" });
  });

  it("outputs json when --output json", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      list: fromSdk(listPlayersSchema, async () => ({ data: { results: [{ id: "1" }] } }), "List"),
    });
    await cli.run(["players", "list", "--output", "json"]);
    const parsed = JSON.parse(out.lines[0]!);
    expect(parsed.format).toBe("json");
  });

  it("unwraps results array from sdk response", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      list: fromSdk(
        listPlayersSchema,
        async () => ({ data: { results: [{ id: "1" }, { id: "2" }] } }),
        "List",
      ),
    });
    await cli.run(["players", "list"]);
    const parsed = JSON.parse(out.lines[0]!);
    expect(parsed.data).toHaveLength(2);
  });
});

describe("error handling", () => {
  it("errors on missing required flag", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, async () => ({ data: null }), "Get a player"),
    });
    const origExit = process.exit;
    process.exit = (() => {
      throw new Error("exit:1");
    }) as never;
    try {
      await cli.run(["players", "get"]);
    } catch (e) {
      expect((e as Error).message).toBe("exit:1");
    } finally {
      process.exit = origExit;
    }
    expect(out.errors.some((e) => e.includes("--id"))).toBe(true);
  });

  it("errors on unknown resource", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, async () => ({ data: null }), "Get a player"),
    });
    const origExit = process.exit;
    process.exit = (() => {
      throw new Error("exit:1");
    }) as never;
    try {
      await cli.run(["teams", "get"]);
    } catch (e) {
      expect((e as Error).message).toBe("exit:1");
    } finally {
      process.exit = origExit;
    }
    expect(out.errors.some((e) => e.includes("teams"))).toBe(true);
  });

  it("errors on unknown action", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, async () => ({ data: null }), "Get a player"),
    });
    const origExit = process.exit;
    process.exit = (() => {
      throw new Error("exit:1");
    }) as never;
    try {
      await cli.run(["players", "delete"]);
    } catch (e) {
      expect((e as Error).message).toBe("exit:1");
    } finally {
      process.exit = origExit;
    }
    expect(out.errors.some((e) => e.includes("delete"))).toBe(true);
  });

  it("propagates sdk errors", async () => {
    const out = makeOutput();
    const cli = makeCli(out);
    cli.resource("players", {
      get: fromSdk(playerSchema, async () => ({ error: "not found" }), "Get a player"),
    });
    await expect(cli.run(["players", "get", "--id", "99"])).rejects.toThrow("not found");
  });
});
