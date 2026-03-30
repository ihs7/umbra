import { stringify } from "yaml";
import type { OutputFormat, OutputFormatter } from "./types";

export const defaultFormatter: OutputFormatter = {
  print(...args: unknown[]) {
    console.log(...args);
  },

  error(...args: unknown[]) {
    console.error(...args);
  },

  output(data: Record<string, unknown>[], format: OutputFormat) {
    if (data.length === 0) {
      console.log("No results.");
      return;
    }

    switch (format) {
      case "json":
        console.log(JSON.stringify(data, null, 2));
        break;
      case "table": {
        const keys = Object.keys(data[0]!);
        console.log(`| ${keys.join(" | ")} |`);
        console.log(`| ${keys.map(() => "---").join(" | ")} |`);
        for (const row of data) {
          console.log(`| ${keys.map((k) => String(row[k] ?? "")).join(" | ")} |`);
        }
        break;
      }
      case "yaml":
        console.log(stringify(data).trimEnd());
        break;
    }
  },
};
