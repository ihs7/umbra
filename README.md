# umbra

Generate full-featured CLIs from OpenAPI specs or [hey-api](https://heyapi.dev) SDKs.

## Requirements

- Node.js 22+ (or Bun 1.4+)

## Install

```sh
bun add @ihs7/umbra
```

## Quick start

### From an OpenAPI spec

```sh
bunx umbra --openapi https://api.example.com/openapi.json --out src/cli.gen.ts
```

```ts
import { createCli } from "./cli.gen";

const cli = createCli({ name: "mycli", version: "1.0.0" });
await cli.run();
```

### From a hey-api SDK

```sh
bunx umbra --hey-api ./src/client --out src/cli.gen.ts
```

```ts
import { fromResources } from "@ihs7/umbra";
import { resources } from "./cli.gen";

const cli = fromResources(resources, { name: "mycli", version: "1.0.0" });
await cli.run();
```

### Programmatic

```ts
import { createCli, fromSdk } from "@ihs7/umbra";
import { listProjects } from "./client/sdk.gen";
import { zListProjectsData } from "./client/zod.gen";

const cli = createCli({ name: "mycli", version: "1.0.0" });

cli.resource("projects", {
  list: fromSdk(zListProjectsData, listProjects, "List all projects"),
});

await cli.run();
```

## Auth

```ts
const cli = fromResources(resources, {
  name: "mycli",
  auth: {
    keychain: "mycli",
    envVar: "MYCLI_API_TOKEN",
    header: (token) => ({ Authorization: `Bearer ${token}` }),
  },
});
```

Adds `auth login`, `auth logout`, and `auth status` commands. The token is read
from the env var first, falling back to the system keychain (macOS `security`
keychain).

## Generate docs

Generate a Markdown command reference from your spec or SDK:

```sh
bunx umbra docs --openapi https://api.example.com/openapi.json --name mycli --out COMMANDS.md
bunx umbra docs --hey-api ./src/client --name mycli --out COMMANDS.md
```

## Generator flags

| Flag                      | Applies to                | Description                                                       |
| ------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `--openapi <url-or-path>` | generator, docs           | OpenAPI spec source                                               |
| `--hey-api <dir>`         | generator, docs           | Directory containing a hey-api SDK                                |
| `--out <path>`            | generator, docs           | Output file (defaults to `cli.gen.ts`, or `COMMANDS.md` for docs) |
| `--package <name>`        | generator                 | Package to import from in generated code (default: `@ihs7/umbra`) |
| `--sdk-prefix <prefix>`   | generator (hey-api)       | Import prefix for SDK modules (default: `./`)                     |
| `--strip-prefix <prefix>` | generator, docs (OpenAPI) | Strip a path prefix when deriving resource names                  |
| `--name <cli-name>`       | docs                      | CLI name used in the generated reference (default: `cli`)         |

## CLI flags

Every generated command supports:

```text
--output    Output format: yaml (default), json, table
--help      Show usage for a command
--version   Show CLI version
```

## Development

```sh
bun install
bun run check   # format, typecheck, lint, test, and build
```

Individual scripts: `bun run format`, `bun run typecheck`, `bun run lint`,
`bun test`, `bun run build`. Use `bun run lint:fix` to apply automatic lint
fixes and `bun run test:coverage` to collect coverage.

## License

MIT
