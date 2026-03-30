interface OApiSchema {
  type?: string;
  properties?: Record<string, OApiSchema>;
  required?: string[];
  items?: OApiSchema;
  enum?: unknown[];
  $ref?: string;
  oneOf?: OApiSchema[];
  anyOf?: OApiSchema[];
  allOf?: OApiSchema[];
  nullable?: boolean;
  additionalProperties?: boolean | OApiSchema;
  format?: string;
}

type Resolver = (ref: string) => OApiSchema;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateSchema(
  value: unknown,
  schema: OApiSchema,
  resolve: Resolver,
  path: string,
): string[] {
  if (schema.$ref) return validateSchema(value, resolve(schema.$ref), resolve, path);

  const errors: string[] = [];

  if (schema.nullable && value === null) return errors;

  if (schema.allOf) {
    for (const sub of schema.allOf) {
      errors.push(...validateSchema(value, sub, resolve, path));
    }
    return errors;
  }

  if (schema.oneOf) {
    const passing = schema.oneOf.filter(
      (sub) => validateSchema(value, sub, resolve, path).length === 0,
    );
    if (passing.length !== 1) {
      errors.push(`${path}: expected exactly one of oneOf to match, got ${passing.length}`);
    }
    return errors;
  }

  if (schema.anyOf) {
    const passing = schema.anyOf.some(
      (sub) => validateSchema(value, sub, resolve, path).length === 0,
    );
    if (!passing) {
      errors.push(`${path}: expected at least one of anyOf to match`);
    }
    return errors;
  }

  if (schema.type) {
    const actual = typeOf(value);
    const expected = schema.type;

    if (expected === "integer") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push(`${path}: expected integer, got ${actual}`);
        return errors;
      }
    } else if (expected === "number") {
      if (typeof value !== "number") {
        errors.push(`${path}: expected number, got ${actual}`);
        return errors;
      }
    } else if (expected !== actual) {
      errors.push(`${path}: expected ${expected}, got ${actual}`);
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum [${schema.enum.join(", ")}]`);
  }

  if (
    schema.type === "object" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const obj = value as Record<string, unknown>;
    const requiredSet = new Set(schema.required ?? []);
    for (const key of requiredSet) {
      if (!(key in obj)) {
        errors.push(`${path}.${key}: required property missing`);
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateSchema(obj[key], propSchema, resolve, `${path}.${key}`));
        }
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      errors.push(...validateSchema(value[i], schema.items, resolve, `${path}[${i}]`));
    }
  }

  return errors;
}

export function createValidator(schemas: Record<string, OApiSchema> | undefined) {
  const resolve: Resolver = (ref: string) => {
    const parts = ref.replace(/^#\//, "").split("/");
    let current: unknown = { components: { schemas: schemas ?? {} } };
    for (const part of parts) {
      current = (current as Record<string, unknown>)[part];
    }
    return current as OApiSchema;
  };

  return {
    validate(value: unknown, schema: OApiSchema | undefined): string[] {
      if (!schema) return [];
      return validateSchema(value, schema, resolve, "$");
    },
  };
}
