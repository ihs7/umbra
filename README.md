# umbra

The Swiss-army knife of CLI generation.

## Install

```sh
bun add @ihs7/umbra
```

## Usage

### From an OpenAPI spec

Generate a typed CLI module from a spec URL or local file:

```sh
bunx umbra --openapi https://api.example.com/openapi.json --out src/cli.gen.ts
```

Then wire it up in your entrypoint:

```ts
import { createCli } from "./cli.gen";

const cli = createCli({ name: "mycli", version: "1.0.0" });
await cli.run();
```

### From a hey-api SDK

Generate a CLI registry from a [hey-api](https://heyapi.dev) generated SDK:

```sh
bunx umbra --hey-api ./src/client --out src/cli.gen.ts
```

Then use `fromResources` with the generated registry:

```ts
import { fromResources } from "@ihs7/umbra";
import { resources } from "./cli.gen";

const cli = fromResources(resources, { name: "mycli", version: "1.0.0" });
await cli.run();
```

### Programmatic API

Build a CLI manually using `createCli`:

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

Configure token-based auth via the system keychain or an environment variable:

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

This adds `auth login`, `auth logout`, and `auth status` commands automatically.

```sh
mycli auth login        # prompts for token, stores in system keychain
mycli auth status       # shows token source and masked value
mycli auth logout       # removes token from keychain
```

The token is read from the env var first, falling back to the keychain.

## Configuration

| Option          | Type               | Description                                      |
| --------------- | ------------------ | ------------------------------------------------ |
| `name`          | `string`           | CLI name used in help output                     |
| `version`       | `string`           | Shown by `--version`                             |
| `naming`        | `"kebab" \| "camel" \| "snake"` | Command naming strategy (default: `"kebab"`) |
| `defaultOutput` | `"yaml" \| "json" \| "table"` | Default output format (default: `"yaml"`) |
| `auth`          | `CliAuthConfig`    | Token auth configuration                         |
| `commands`      | `CliResource[]`    | Additional resource/action groups                |
| `setup`         | `() => Promise<void>` | Called before each authenticated command      |

## CLI flags

Every generated command supports:

```
--<param>   Set a parameter value
--output    Output format: yaml (default), json, table
--help      Show usage for a command
--version   Show CLI version
```

## License

MIT
