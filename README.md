# umbra

Generate full-featured CLIs from OpenAPI specs or [hey-api](https://heyapi.dev) SDKs.

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

Adds `auth login`, `auth logout`, and `auth status` commands. Token is read from the env var first, falling back to the system keychain.

## Generate docs

Generate a Markdown command reference from your spec or SDK:

```sh
bunx umbra docs --openapi https://api.example.com/openapi.json --name mycli --out COMMANDS.md
bunx umbra docs --hey-api ./src/client --name mycli --out COMMANDS.md
```

## CLI flags

Every generated command supports:

```text
--output    Output format: yaml (default), json, table
--help      Show usage for a command
--version   Show CLI version
```

## License

MIT
