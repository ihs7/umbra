import { spawnSync } from "node:child_process";

function run(cmd: string[]): { ok: boolean; output: string } {
  const [bin, ...args] = cmd;
  const result = spawnSync(bin!, args, { encoding: "utf-8" });
  const ok = result.status === 0;
  return { ok, output: ok ? result.stdout : result.stderr };
}

export function keychain(service: string) {
  return {
    async get(account: string): Promise<string | null> {
      const { ok, output } = run([
        "security",
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
      ]);
      return ok ? output.trim() : null;
    },

    async set(account: string, token: string): Promise<void> {
      run(["security", "delete-generic-password", "-s", service, "-a", account]);
      const { ok, output } = run([
        "security",
        "add-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
        token,
      ]);
      if (!ok) throw new Error(`Failed to save token: ${output}`);
    },

    async delete(account: string): Promise<boolean> {
      const { ok } = run(["security", "delete-generic-password", "-s", service, "-a", account]);
      return ok;
    },
  };
}
