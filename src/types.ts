export type NamingStrategy = "kebab" | "camel" | "snake";

export type OutputFormat = "yaml" | "json" | "table";

export interface OutputFormatter {
  print(...args: unknown[]): void;
  error(...args: unknown[]): void;
  output(data: Record<string, unknown>[], format: OutputFormat): void;
}

export type ParamLocation = "path" | "query" | "body";

export type ParamKind = "string" | "number" | "boolean" | "array" | "unknown";

export interface CliParam {
  name: string;
  location: ParamLocation;
  kind: ParamKind;
  required: boolean;
  description?: string;
}

export interface SchemaIntrospector {
  extractParams(schema: unknown): CliParam[];
  coerceValue(value: string | string[], param: CliParam): unknown;
}

export interface CliCommand {
  description: string;
  params: CliParam[];
  handler: (args: {
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  }) => Promise<unknown>;
}

export interface CliExclude {
  resource: string;
  action?: string;
}

export interface CliResource {
  name: string;
  actions: Record<string, CliCommand>;
  public?: boolean;
  override?: boolean;
}

export interface CliAuthConfig {
  keychain: string;
  account?: string;
  envVar?: string;
  header: (token: string) => Record<string, string>;
}

export interface CliConfig {
  name: string;
  version?: string;
  naming?: NamingStrategy;
  defaultOutput?: OutputFormat;
  formatter?: OutputFormatter;
  introspector?: SchemaIntrospector;
  setup?: () => Promise<void>;
  commands?: CliResource[];
  exclude?: CliExclude[];
  auth?: CliAuthConfig;
}
