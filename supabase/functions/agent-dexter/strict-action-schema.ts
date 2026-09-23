type Json = Record<string, unknown>
const object = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value)

/** Validate every object, including array items and anyOf branches, before sending tools upstream. */
export function strictNestedSchemaError(schema: unknown, path = "parameters", depth = 0): string | null {
  if (!object(schema)) return `${path}:schema_not_object`
  if (depth > 32) return `${path}:schema_too_deep`
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (types.includes("object") || schema.properties !== undefined) {
    if (!object(schema.properties)) return `${path}:properties_not_object`
    if (!Array.isArray(schema.required)) return `${path}:required_not_array`
    if (schema.additionalProperties !== false) return `${path}:additional_properties_not_false`
    const keys = Object.keys(schema.properties)
    if (schema.required.length !== keys.length || keys.some(key => !(schema.required as unknown[]).includes(key))) {
      return `${path}:required_properties_mismatch`
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      const error = strictNestedSchemaError(child, `${path}.${key}`, depth + 1)
      if (error) return error
    }
  }
  if (types.includes("array")) {
    const error = strictNestedSchemaError(schema.items, `${path}.items`, depth + 1)
    if (error) return error
  }
  if (schema.anyOf !== undefined) {
    if (!Array.isArray(schema.anyOf) || !schema.anyOf.length) return `${path}:any_of_empty`
    for (const [index, child] of schema.anyOf.entries()) {
      const error = strictNestedSchemaError(child, `${path}.anyOf[${index}]`, depth + 1)
      if (error) return error
    }
  }
  if (object(schema.$defs)) for (const [key, child] of Object.entries(schema.$defs)) {
    const error = strictNestedSchemaError(child, `${path}.$defs.${key}`, depth + 1)
    if (error) return error
  }
  return null
}
