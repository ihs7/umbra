import type { NamingStrategy } from "./types";

export function toKebab(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

export function toCamel(s: string): string {
  return s.replace(/[-_]([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toSnake(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

export function formatName(key: string, naming: NamingStrategy): string {
  switch (naming) {
    case "camel":
      return toCamel(key);
    case "snake":
      return toSnake(key);
    default:
      return toKebab(key);
  }
}

export function findMatch<T>(
  map: Record<string, T>,
  input: string,
  naming: NamingStrategy,
): [string, T] | undefined {
  const normalizedInput = formatName(input, naming);
  for (const [key, value] of Object.entries(map)) {
    if (formatName(key, naming) === normalizedInput) return [key, value];
  }
  return undefined;
}
