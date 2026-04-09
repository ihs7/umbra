import { keychain } from "./keychain";
import type { CliAuthConfig, CliCommand, CliResource } from "./types";

type HandlerArgs = Parameters<CliCommand["handler"]>[0];
type AuthedHandler = (args: HandlerArgs, headers: Record<string, string>) => Promise<unknown>;

export function withAuth(auth: CliAuthConfig, handler: AuthedHandler): CliCommand["handler"] {
  const kc = keychain(auth.keychain);
  const account = auth.account ?? "api-token";
  const envVar = auth.envVar;
  return async (args) => {
    const token = (envVar && process.env[envVar]) ?? (await kc.get(account));
    if (!token) throw new Error("Not authenticated.");
    return handler(args, auth.header(token));
  };
}

async function promptToken(): Promise<string | undefined> {
  process.stdout.write("Enter API token: ");
  const token = await new Promise<string>((resolve) => {
    const chunks: string[] = [];
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on("data", function handler(buf: Buffer) {
      const char = buf.toString();
      if (char === "\r" || char === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", handler);
        process.stdout.write("\n");
        resolve(chunks.join(""));
      } else if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(1);
      } else if (char === "\u007f") {
        if (chunks.length > 0) {
          chunks.pop();
          process.stdout.write("\b \b");
        }
      } else {
        for (const c of char) {
          chunks.push(c);
          process.stdout.write("*");
        }
      }
    });
  });
  return token.trim() || undefined;
}

export function resolveAuthDefaults(cliName: string, auth: CliAuthConfig) {
  return {
    account: auth.account ?? "api-token",
    envVar: auth.envVar ?? `${cliName.toUpperCase().replace(/-/g, "_")}_API_TOKEN`,
  };
}

export function authCommand(cliName: string, auth: CliAuthConfig): CliResource {
  const kc = keychain(auth.keychain);
  const { account, envVar } = resolveAuthDefaults(cliName, auth);

  return {
    name: "auth",
    public: true,
    actions: {
      login: {
        description: "Store API token in system keychain",
        params: [
          {
            name: "token",
            location: "query",
            kind: "string",
            required: false,
            description: "API token",
          },
        ],
        handler: async (args) => {
          let token = (args.query as Record<string, string> | undefined)?.token;
          if (!token) token = await promptToken();
          if (!token) {
            process.stderr.write("No token provided.\n");
            process.exit(1);
          }
          await kc.set(account, token);
          process.stdout.write("Token saved to keychain.\n");
        },
      },
      logout: {
        description: "Remove API token from system keychain",
        params: [],
        handler: async () => {
          const removed = await kc.delete(account);
          process.stdout.write(removed ? "Token removed from keychain.\n" : "No token found.\n");
        },
      },
      status: {
        description: "Show current auth status",
        params: [],
        handler: async () => {
          const envToken = process.env[envVar];
          const keychainToken = await kc.get(account);
          const token = envToken ?? keychainToken;
          if (!token) {
            process.stdout.write("Not authenticated.\n");
            return;
          }
          process.stdout.write(`Source:  ${envToken ? `${envVar} env var` : "system keychain"}\n`);
          process.stdout.write(`Token:   ${token.slice(0, 6)}...${token.slice(-4)}\n`);
        },
      },
    },
  };
}
