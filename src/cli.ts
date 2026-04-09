import { parseArgv, buildArgs, formatUsage } from "./parse";
import { findMatch, formatName } from "./naming";
import { defaultFormatter } from "./format";
import { zodIntrospector } from "./introspect-zod";
import { keychain } from "./keychain";
import { resolveAuthDefaults, authCommand } from "./auth";
import type {
  CliConfig,
  CliCommand,
  CliExclude,
  OutputFormat,
  OutputFormatter,
  NamingStrategy,
  SchemaIntrospector,
} from "./types";

type Registry = Record<string, Record<string, CliCommand>>;
type RegistryMeta = Record<string, { public?: boolean }>;

function pad(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - s.length));
}

export function createCli(
  config: CliConfig,
  configureFn?: (headers: Record<string, string>) => void,
) {
  const registry: Registry = {};
  const meta: RegistryMeta = {};
  const naming: NamingStrategy = config.naming ?? "kebab";
  const kc = config.auth ? keychain(config.auth.keychain) : undefined;
  const defaultOutput: OutputFormat = config.defaultOutput ?? "yaml";
  const fmt: OutputFormatter = config.formatter ?? defaultFormatter;
  const introspector: SchemaIntrospector = config.introspector ?? zodIntrospector;

  function resource(
    name: string,
    actions: Record<string, CliCommand>,
    opts?: { public?: boolean },
  ) {
    registry[name] = { ...registry[name], ...actions };
    if (opts?.public) meta[name] = { public: true };
  }

  function printGroups() {
    const entries = Object.entries(registry)
      .map(([group, actions]) => ({
        name: formatName(group, naming),
        actions: Object.keys(actions)
          .map((a) => formatName(a, naming))
          .sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const maxName = Math.max(...entries.map((e) => e.name.length));

    fmt.print(`${config.name} - CLI generated from OpenAPI\n`);
    fmt.print(`Usage: ${config.name} <resource> <action> [options]`);
    fmt.print(`       ${config.name} <resource> --help`);
    fmt.print(`       ${config.name} --version\n`);
    fmt.print("Resources:\n");

    for (const entry of entries) {
      fmt.print(`  ${pad(entry.name, maxName + 2)}${entry.actions.join(", ")}`);
    }

    fmt.print(`\nRun '${config.name} <resource> --help' for action details.`);
  }

  function printActions(group: string, actions: Record<string, CliCommand>) {
    const entries = Object.entries(actions)
      .map(([name, cmd]) => ({
        name: formatName(name, naming),
        description: cmd.description,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const maxName = Math.max(...entries.map((e) => e.name.length));
    const groupName = formatName(group, naming);

    fmt.print(`Usage: ${config.name} ${groupName} <action> [options]\n`);
    fmt.print("Actions:\n");

    for (const entry of entries) {
      fmt.print(`  ${pad(entry.name, maxName + 2)}${entry.description}`);
    }

    fmt.print(`\nRun '${config.name} ${groupName} <action> --help' for options.`);
  }

  async function run(argv: string[] = process.argv.slice(2)) {
    const [resourceArg, actionArg, ...rest] = argv;

    if (!resourceArg || resourceArg === "--help" || resourceArg === "-h") {
      printGroups();
      return;
    }

    if (resourceArg === "--version" || resourceArg === "-V" || resourceArg === "version") {
      fmt.print(config.version ?? "dev");
      return;
    }

    const groupMatch = findMatch(registry, resourceArg, naming);
    if (!groupMatch) {
      fmt.error(`Unknown resource: ${resourceArg}\n`);
      printGroups();
      process.exit(1);
    }
    const [groupKey, group] = groupMatch;

    if (!actionArg || actionArg === "--help" || actionArg === "-h") {
      printActions(groupKey, group);
      return;
    }

    const cmdMatch = findMatch(group, actionArg, naming);
    if (!cmdMatch) {
      fmt.error(`Unknown action: ${formatName(groupKey, naming)} ${actionArg}\n`);
      printActions(groupKey, group);
      process.exit(1);
    }
    const [, cmd] = cmdMatch;

    if (rest.includes("--help") || rest.includes("-h")) {
      fmt.print(cmd.description + "\n");
      fmt.print(
        formatUsage(
          `${config.name} ${formatName(groupKey, naming)} ${formatName(actionArg, naming)}`,
          cmd.params,
          defaultOutput,
        ),
      );
      return;
    }

    const { flags, outputFormat } = parseArgv(rest, cmd.params, defaultOutput);

    let args;
    try {
      args = buildArgs(flags, cmd.params, introspector);
    } catch (e) {
      fmt.error((e as Error).message + "\n");
      fmt.print(
        formatUsage(
          `${config.name} ${formatName(groupKey, naming)} ${formatName(actionArg, naming)}`,
          cmd.params,
          defaultOutput,
        ),
      );
      process.exit(1);
    }

    const isPublic = meta[groupKey]?.public;
    if (!isPublic) {
      if (config.auth && configureFn) {
        const { header } = config.auth;
        const { account, envVar } = resolveAuthDefaults(config.name, config.auth);
        const token = process.env[envVar] || (kc ? await kc.get(account) : null);
        if (!token) {
          fmt.error(`No API token found. Run: ${config.name} auth login`);
          process.exit(1);
        }
        configureFn(header(token));
      }
      if (config.setup) await config.setup();
    }

    const result = await cmd.handler(args);

    if (result === undefined || result === null) {
      fmt.print("Done.");
      return;
    }

    if (Array.isArray(result)) {
      fmt.output(result as Record<string, unknown>[], outputFormat as OutputFormat);
    } else if (typeof result === "object") {
      fmt.output([result as Record<string, unknown>], outputFormat as OutputFormat);
    } else {
      fmt.print(String(result));
    }
  }

  return { resource, run, registry, kc };
}

export function fromResources(
  resources: Record<string, Record<string, CliCommand>>,
  config: CliConfig,
  configureFn?: (headers: Record<string, string>) => void,
) {
  const cli = createCli(config, configureFn);
  const excludes: CliExclude[] = config.exclude ?? [];

  for (const [name, actions] of Object.entries(resources)) {
    // Check if the entire resource is excluded
    const resourceExcluded = excludes.some((e) => e.resource === name && e.action === undefined);
    if (resourceExcluded) continue;

    // Filter out individually excluded actions
    const filteredActions = Object.fromEntries(
      Object.entries(actions).filter(
        ([action]) => !excludes.some((e) => e.resource === name && e.action === action),
      ),
    );

    if (Object.keys(filteredActions).length > 0) {
      cli.resource(name, filteredActions);
    }
  }

  for (const { name, actions, public: pub, override: ovr } of config.commands ?? []) {
    if (ovr) {
      // Remove the entire spec resource so the custom command is the sole definition
      delete cli.registry[name];
    }
    cli.resource(name, actions, { public: pub });
  }

  if (config.auth) {
    const { name, actions, public: pub } = authCommand(config.name, config.auth);
    cli.resource(name, actions, { public: pub });
  }
  return cli;
}
