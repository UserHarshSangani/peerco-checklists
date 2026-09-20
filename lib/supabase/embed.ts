// PostgREST embeds a to-one relation as an object, but some client/schema
// combinations return a one-item array instead. Normalize either shape.
export function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
