import { zodIntrospector } from "./introspect-zod";
import type { CliCommand, SchemaIntrospector } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkFn = (...args: any[]) => Promise<{ data?: unknown; error?: unknown }>;

export function fromSdk(
  schema: unknown,
  fn: SdkFn,
  description: string,
  options?: {
    introspector?: SchemaIntrospector;
    transform?: (data: unknown) => unknown;
  },
): CliCommand {
  const introspector = options?.introspector ?? zodIntrospector;
  const params = introspector.extractParams(schema);

  return {
    description,
    params,
    handler: async (args) => {
      const result = await fn(args);
      if (result.error) {
        throw new Error(
          typeof result.error === "string" ? result.error : JSON.stringify(result.error),
        );
      }
      const data = result.data;
      if (options?.transform) return options.transform(data);
      if (data && typeof data === "object" && "results" in data) {
        return (data as { results: unknown[] }).results;
      }
      return data;
    },
  };
}
