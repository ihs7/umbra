import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    target: "node18",
    outDir: "dist",
  },
  {
    entry: { generate: "bin/generate-cli.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    splitting: false,
    target: "node18",
    outDir: "dist",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
