import { toKebab, toCamel } from "./naming";
import type { CliParam, SchemaIntrospector } from "./types";

function buildShortFlags(params: CliParam[]): Record<string, string> {
  const short: Record<string, string> = {};
  for (const param of params) {
    const kebab = toKebab(param.name);
    const letter = kebab[0]!;
    if (letter !== "o" && !short[letter]) short[letter] = kebab;
  }
  return short;
}

export function parseArgv(
  argv: string[],
  params: CliParam[],
  defaultOutput: string,
): { flags: Record<string, string | string[]>; outputFormat: string } {
  const flags: Record<string, string | string[]> = {};
  let outputFormat = defaultOutput;
  const shortFlags = buildShortFlags(params);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];

    let key: string;
    if (arg.startsWith("--")) {
      key = arg.slice(2);
    } else if (arg.startsWith("-") && arg.length === 2) {
      const letter = arg[1]!;
      if (letter === "o") {
        outputFormat = next ?? defaultOutput;
        i++;
        continue;
      }
      const resolved = shortFlags[letter];
      if (!resolved) continue;
      key = resolved;
    } else {
      continue;
    }

    if (key === "output" || key === "o") {
      outputFormat = next ?? defaultOutput;
      i++;
      continue;
    }

    if (!next || next.startsWith("-")) {
      flags[key] = "true";
      continue;
    }

    const paramName = toCamel(key);
    const param = params.find((p) => p.name === paramName);

    if (param?.kind === "array") {
      const existing = flags[key];
      if (Array.isArray(existing)) {
        existing.push(next);
      } else {
        flags[key] = [next];
      }
    } else {
      flags[key] = next;
    }
    i++;
  }

  return { flags, outputFormat };
}

export function buildArgs(
  flags: Record<string, string | string[]>,
  params: CliParam[],
  introspector: SchemaIntrospector,
): {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
} {
  const path: Record<string, unknown> = {};
  const query: Record<string, unknown> = {};
  const body: Record<string, unknown> = {};

  for (const param of params) {
    const kebab = toKebab(param.name);
    const value = flags[kebab] ?? flags[param.name];
    if (value === undefined) {
      if (param.required) throw new Error(`Missing required flag: --${kebab}`);
      continue;
    }
    const coerced = introspector.coerceValue(value, param);
    switch (param.location) {
      case "path":
        path[param.name] = coerced;
        break;
      case "query":
        query[param.name] = coerced;
        break;
      case "body":
        body[param.name] = coerced;
        break;
    }
  }

  return {
    ...(Object.keys(path).length > 0 && { path }),
    ...(Object.keys(query).length > 0 && { query }),
    ...(Object.keys(body).length > 0 && { body }),
  };
}

function pad(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - s.length));
}

export function formatUsage(name: string, params: CliParam[], defaultOutput: string): string {
  const shortFlags = buildShortFlags(params);
  const shortByKebab = Object.fromEntries(Object.entries(shortFlags).map(([k, v]) => [v, k]));

  const allFlags = [
    ...params.map((p) => {
      const kebab = toKebab(p.name);
      const short = shortByKebab[kebab];
      const flagStr = short
        ? `-${short}, --${kebab} ${p.kind === "array" ? "<value...>" : "<value>"}`
        : `--${kebab} ${p.kind === "array" ? "<value...>" : "<value>"}`;
      return {
        flag: flagStr,
        desc: [p.description, p.required ? "(required)" : ""].filter(Boolean).join(" "),
      };
    }),
    {
      flag: "-o, --output <format>",
      desc: `Output format: yaml, json, table (default: ${defaultOutput})`,
    },
    { flag: "--help", desc: "Show this help" },
  ];

  const maxFlag = Math.max(...allFlags.map((f) => f.flag.length));

  const lines = [`Usage: ${name} [options]\n`, "Options:\n"];
  for (const { flag, desc } of allFlags) {
    lines.push(`  ${pad(flag, maxFlag + 2)}${desc}`);
  }

  return lines.join("\n");
}
