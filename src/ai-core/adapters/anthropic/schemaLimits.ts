import { AiProviderError } from '../../errors';

/**
 * Anthropic structured-output / tool-input schema constraint:
 *
 *   "Schemas contains too many parameters with union types
 *    (N parameters with type arrays or anyOf). This causes exponential
 *    compilation cost. Reduce the number of nullable or union-typed
 *    parameters. limit: 16"
 *
 * A "parameter with a union type" is any schema node that uses one of:
 *   - `type` as an ARRAY  (e.g. ["string","null"], ["integer","null"], ["array","null"])
 *   - `anyOf`
 *   - `oneOf`
 *   - the legacy `nullable: true` annotation
 *
 * This module counts those nodes across a JSON Schema so we can REJECT an
 * over-complex request LOCALLY (without ever calling Anthropic), and so we
 * have a single, testable source of truth for the provider constraint.
 */
export const ANTHROPIC_MAX_UNION_PARAMETERS = 16;

export interface UnionParameterInfo {
  /** JSON-pointer-ish path of the offending schema node. */
  path: string;
  /** Which union construct was used. */
  kind: 'type-array' | 'anyOf' | 'oneOf' | 'nullable';
}

interface Walkable {
  [key: string]: unknown;
}

function isObject(value: unknown): value is Walkable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively count schema "parameters" that become union types on the wire.
 * Every object schema (the root, nested `properties`, and array `items`) is
 * walked; each node that uses a union construct is counted once.
 */
export function countUnionParameters(schema: unknown, path = '$'): UnionParameterInfo[] {
  const hits: UnionParameterInfo[] = [];
  if (!isObject(schema)) return hits;

  if (Array.isArray(schema.type)) {
    hits.push({ path, kind: 'type-array' });
  }
  if ('anyOf' in schema && Array.isArray((schema as Walkable).anyOf)) {
    hits.push({ path, kind: 'anyOf' });
  }
  if ('oneOf' in schema && Array.isArray((schema as Walkable).oneOf)) {
    hits.push({ path, kind: 'oneOf' });
  }
  if ((schema as Walkable).nullable === true) {
    hits.push({ path, kind: 'nullable' });
  }

  // Walk nested property schemas.
  if (isObject(schema.properties)) {
    for (const [name, child] of Object.entries(schema.properties as Walkable)) {
      hits.push(...countUnionParameters(child, `${path}.${name}`));
    }
  }
  // Walk array item schemas (items may be an object or a tuple array).
  if ('items' in schema) {
    const items = (schema as Walkable).items;
    if (isObject(items)) hits.push(...countUnionParameters(items, `${path}[]`));
    else if (Array.isArray(items)) {
      items.forEach((child, index) => {
        if (isObject(child)) hits.push(...countUnionParameters(child, `${path}[${index}]`));
      });
    }
  }
  // Walk anyOf/oneOf branches themselves (they can nest further unions).
  for (const combinator of ['anyOf', 'oneOf'] as const) {
    const branches = (schema as Walkable)[combinator];
    if (Array.isArray(branches)) {
      branches.forEach((branch, index) => {
        if (isObject(branch)) hits.push(...countUnionParameters(branch, `${path}.${combinator}[${index}]`));
      });
    }
  }
  return hits;
}

export interface AnthropicSchemaPreflightResult {
  unionParameters: number;
  maximumAllowed: number;
  exceeded: boolean;
  offenders: UnionParameterInfo[];
}

/**
 * Preflight validation for ONE schema (tool input_schema OR output schema).
 * Counts union/anyOf/oneOf/nullable parameters and reports whether the
 * request would violate the provider limit.
 */
export function inspectAnthropicSchema(schema: unknown): AnthropicSchemaPreflightResult {
  const offenders = countUnionParameters(schema);
  return {
    unionParameters: offenders.length,
    maximumAllowed: ANTHROPIC_MAX_UNION_PARAMETERS,
    exceeded: offenders.length > ANTHROPIC_MAX_UNION_PARAMETERS,
    offenders,
  };
}

/**
 * Build schema → count union/anyOf parameters → validate against provider
 * constraints → reject locally BEFORE any network call when over the limit.
 *
 * Throws a PROVIDER_INVALID_REQUEST AiProviderError carrying the structured
 * marker `ANTHROPIC_SCHEMA_LIMIT_EXCEEDED` so the failure is deterministic and
 * never retried against the provider.
 */
export function assertAnthropicSchemaWithinLimit(schema: unknown, context: string): void {
  const report = inspectAnthropicSchema(schema);
  if (!report.exceeded) return;
  const diagnostic = JSON.stringify({
    error: 'ANTHROPIC_SCHEMA_LIMIT_EXCEEDED',
    context,
    union_parameters: report.unionParameters,
    maximum_allowed: report.maximumAllowed,
    offenders: report.offenders.map((offender) => `${offender.path} (${offender.kind})`),
  });
  console.error(`[AI Core Anthropic] ${diagnostic}`);
  throw new AiProviderError(
    'PROVIDER_INVALID_REQUEST',
    'anthropic',
    `ANTHROPIC_SCHEMA_LIMIT_EXCEEDED: ${report.unionParameters} union parameters (max ${report.maximumAllowed}) in ${context}.`,
    { status: 400, retryable: false, diagnostic },
  );
}
