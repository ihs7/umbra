import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { createValidator } from "./validate";
import { HttpError } from "./types";
import type { CliCommand, CliParam, ParamKind, ParamLocation } from "./types";

interface OApiParam {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OApiSchema;
}

interface OApiSchema {
  type?: string;
  properties?: Record<string, OApiSchema>;
  required?: string[];
  items?: OApiSchema;
  description?: string;
  $ref?: string;
}

interface OApiRequestBody {
  content?: Record<string, { schema?: OApiSchema }>;
  required?: boolean;
}

interface OApiResponse {
  content?: Record<string, { schema?: OApiSchema }>;
}

interface OApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OApiParam[];
  requestBody?: OApiRequestBody;
  responses?: Record<string, OApiResponse>;
}

interface OApiSpec {
  servers?: { url: string }[];
  paths: Record<string, Record<string, OApiOperation | OApiParam[]>>;
  components?: { schemas?: Record<string, OApiSchema> };
}

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch"]);

function resolveRef(spec: OApiSpec, ref: string): OApiSchema {
  const parts = ref.replace(/^#\//, "").split("/");
  let current: unknown = spec;
  for (const part of parts) {
    current = (current as Record<string, unknown>)[part];
  }
  return current as OApiSchema;
}

function resolveSchema(spec: OApiSpec, schema: OApiSchema): OApiSchema {
  if (schema.$ref) return resolveRef(spec, schema.$ref);
  return schema;
}

function toParamKind(schema: OApiSchema | undefined): ParamKind {
  if (!schema) return "string";
  const type = schema.type;
  if (type === "integer" || type === "number") return "number";
  if (type === "boolean") return "boolean";
  if (type === "array") return "array";
  return "string";
}

function extractParams(spec: OApiSpec, operation: OApiOperation): CliParam[] {
  const params: CliParam[] = [];

  for (const p of operation.parameters ?? []) {
    const loc = p.in as string;
    if (loc !== "path" && loc !== "query") continue;
    params.push({
      name: p.name,
      location: loc as ParamLocation,
      kind: toParamKind(p.schema),
      required: p.required ?? loc === "path",
      description: p.description,
    });
  }

  const bodyContent = operation.requestBody?.content;
  if (bodyContent) {
    const jsonSchema = bodyContent["application/json"]?.schema;
    if (jsonSchema) {
      const resolved = resolveSchema(spec, jsonSchema);
      const required = new Set(resolved.required ?? []);
      for (const [name, propSchema] of Object.entries(resolved.properties ?? {})) {
        const resolvedProp = resolveSchema(spec, propSchema);
        params.push({
          name,
          location: "body",
          kind: toParamKind(resolvedProp),
          required: required.has(name),
          description: resolvedProp.description,
        });
      }
    }
  }

  return params;
}

function responseSchema(operation: OApiOperation): OApiSchema | undefined {
  if (!operation.responses) return undefined;
  const success =
    operation.responses["200"] ?? operation.responses["201"] ?? operation.responses["2XX"];
  return success?.content?.["application/json"]?.schema;
}

function requestBodySchema(operation: OApiOperation): OApiSchema | undefined {
  return operation.requestBody?.content?.["application/json"]?.schema;
}

function methodToAction(method: string): string {
  const map: Record<string, string> = {
    get: "list",
    post: "create",
    put: "update",
    delete: "delete",
    patch: "patch",
  };
  return map[method] ?? method;
}

function stripPathPrefix(path: string, prefix: string): string {
  const normalized = prefix.replace(/\/$/, "");
  if (!normalized) return path;
  if (path === normalized || path.startsWith(normalized + "/")) {
    return path.slice(normalized.length) || "/";
  }
  return path;
}

function actionFromPath(path: string, method: string): string {
  const segments = path
    .replace(/^\//, "")
    .split("/")
    .slice(1)
    .filter((s) => s.length > 0 && !s.startsWith("{"));

  if (segments.length > 0) return segments.join("-");

  const endsWithParam = path.replace(/\/$/, "").endsWith("}");
  if (method === "get" && endsWithParam) return "get";

  return methodToAction(method);
}

function resourceFromPath(path: string): string {
  return (
    path
      .replace(/^\//, "")
      .split("/")
      .filter((s) => s.length > 0)[0]
      ?.replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase() ?? path
  );
}

function buildUrl(baseUrl: string, path: string, pathParams: Record<string, unknown>): string {
  let resolved = path;
  for (const [key, value] of Object.entries(pathParams)) {
    resolved = resolved.replace(`{${key}}`, String(value));
  }
  return `${baseUrl}${resolved}`;
}

export interface FromSpecOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  validate?: boolean;
  /** Strip a path prefix from all routes before deriving resource and action names.
   * For example, with `stripPrefix: "/api/v1"`, the path `/api/v1/users/{id}` is
   * treated as `/users/{id}`, yielding resource `users` and action `get`.
   */
  stripPrefix?: string;
}

export type SpecSource = string | OApiSpec;

function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

function parseRaw(raw: string, hint: string): OApiSpec {
  return hint.endsWith(".json") || raw.trimStart().startsWith("{")
    ? JSON.parse(raw)
    : parseYaml(raw);
}

function assertSpec(obj: unknown): asserts obj is OApiSpec {
  if (!obj || typeof obj !== "object" || !("paths" in obj)) {
    throw new Error("Source is not a valid OpenAPI spec (missing 'paths')");
  }
}

export async function loadSpec(source: SpecSource): Promise<OApiSpec> {
  if (typeof source !== "string") {
    assertSpec(source);
    return source;
  }
  let spec: unknown;
  if (isUrl(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
    spec = parseRaw(await res.text(), source);
  } else {
    spec = parseRaw(readFileSync(source, "utf-8"), source);
  }
  assertSpec(spec);
  return spec;
}

export interface RouteEntry {
  resource: string;
  action: string;
  path: string;
  method: string;
  description: string;
  params: CliParam[];
  defaultBaseUrl: string;
  operationId?: string;
}

export function extractRoutes(spec: OApiSpec, options?: { stripPrefix?: string }): RouteEntry[] {
  const defaultBaseUrl = (spec.servers?.[0]?.url ?? "http://localhost:3000").replace(/\/$/, "");
  const prefix = options?.stripPrefix ?? "";
  const seen = new Set<string>();
  const routes: RouteEntry[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    const effectivePath = prefix ? stripPathPrefix(path, prefix) : path;
    const resource = resourceFromPath(effectivePath);

    for (const [method, value] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method)) continue;
      const operation = value as OApiOperation;
      const action = actionFromPath(effectivePath, method);
      const key = `${resource}:${action}`;
      if (seen.has(key)) continue;
      seen.add(key);

      routes.push({
        resource,
        action,
        path,
        method,
        description:
          operation.summary ?? operation.description ?? `${method.toUpperCase()} ${path}`,
        params: extractParams(spec, operation),
        defaultBaseUrl,
        operationId: operation.operationId,
      });
    }
  }

  return routes;
}

function makeHandler(
  baseUrl: string,
  path: string,
  method: string,
  extraHeaders: Record<string, string>,
  validator: ReturnType<typeof createValidator> | undefined,
  reqSchema: OApiSchema | undefined,
  resSchema: OApiSchema | undefined,
): CliCommand["handler"] {
  return async (args) => {
    if (validator && reqSchema && args.body) {
      const errors = validator.validate(args.body, reqSchema);
      if (errors.length > 0) throw new Error(`Request validation failed:\n${errors.join("\n")}`);
    }

    const url = new URL(buildUrl(baseUrl, path, args.path ?? {}));

    for (const [key, value] of Object.entries(args.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const hasBody =
      method !== "get" &&
      method !== "delete" &&
      args.body &&
      Object.keys(args.body as Record<string, unknown>).length > 0;

    const res = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      ...(hasBody ? { body: JSON.stringify(args.body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      throw new HttpError(res.status, res.statusText, body);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return await res.text();
    }

    const data = await res.json();

    if (validator && resSchema) {
      const errors = validator.validate(data, resSchema);
      if (errors.length > 0) throw new Error(`Response validation failed:\n${errors.join("\n")}`);
    }

    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "results" in data) {
      return (data as { results: unknown[] }).results;
    }
    return data;
  };
}

function buildResources(
  spec: OApiSpec,
  options?: FromSpecOptions,
): Record<string, Record<string, CliCommand>> {
  const serverUrl = options?.baseUrl ?? spec.servers?.[0]?.url ?? "http://localhost:3000";
  const baseUrl = serverUrl.replace(/\/$/, "");
  const extraHeaders = options?.headers ?? {};
  const shouldValidate = options?.validate ?? false;
  const validator = shouldValidate ? createValidator(spec.components?.schemas) : undefined;

  const resources: Record<string, Record<string, CliCommand>> = {};

  for (const route of extractRoutes(spec, { stripPrefix: options?.stripPrefix })) {
    const { resource, action, path, method, description, params } = route;
    if (!resources[resource]) resources[resource] = {};

    const operation = (spec.paths[path] as Record<string, OApiOperation>)[method]!;
    const reqSchema = validator ? requestBodySchema(operation) : undefined;
    const resSchema = validator ? responseSchema(operation) : undefined;

    resources[resource][action] = {
      description,
      params,
      handler: makeHandler(baseUrl, path, method, extraHeaders, validator, reqSchema, resSchema),
    };
  }

  return resources;
}

export function fromSpec(
  source: SpecSource,
  options?: FromSpecOptions,
): Promise<Record<string, Record<string, CliCommand>>> {
  return loadSpec(source).then((spec) => buildResources(spec, options));
}
