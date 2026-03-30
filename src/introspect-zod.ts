import { z } from "zod";
import type { CliParam, ParamKind, ParamLocation, SchemaIntrospector } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

function isOptional(schema: S): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}

function unwrap(schema: S): S {
  if (schema instanceof z.ZodOptional) return schema.unwrap();
  if (schema instanceof z.ZodDefault) return schema.removeDefault();
  return schema;
}

function objectFields(schema: S | undefined): Record<string, S> {
  if (!schema) return {};
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject) return inner.shape as Record<string, S>;
  return {};
}

function resolveKind(schema: S): ParamKind {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodArray) return "array";
  if (inner instanceof z.ZodNumber || inner instanceof z.ZodBigInt) return "number";
  if (inner instanceof z.ZodBoolean) return "boolean";
  if (inner instanceof z.ZodString) return "string";
  return "unknown";
}

function coerce(value: string | string[], kind: ParamKind): unknown {
  if (kind === "array") {
    return Array.isArray(value) ? value : [value];
  }
  const v = Array.isArray(value) ? value[0]! : value;
  if (kind === "number") return Number(v);
  if (kind === "boolean") return v === "true";
  return v;
}

export const zodIntrospector: SchemaIntrospector = {
  extractParams(schema: unknown): CliParam[] {
    const fields = objectFields(schema);
    const params: CliParam[] = [];

    for (const [location, locSchema] of Object.entries(fields) as [string, S][]) {
      if (location === "url") continue;
      if (location === "body" || location === "path" || location === "query") {
        const innerFields = objectFields(locSchema);
        for (const [name, fieldSchema] of Object.entries(innerFields)) {
          params.push({
            name,
            location: location as ParamLocation,
            kind: resolveKind(fieldSchema),
            required: !isOptional(fieldSchema),
            description: (fieldSchema as S).description,
          });
        }
      }
    }

    return params;
  },

  coerceValue(value: string | string[], param: CliParam): unknown {
    return coerce(value, param.kind);
  },
};
