import { createHash, randomUUID } from 'node:crypto';
import type {
  AiToolDefinition,
  AiToolGateway,
  CanonicalToolAudit,
  CanonicalToolCall,
} from '../ai-core/contracts';
import {
  ASSISTANT_SYNCHRONOUS_WRITE_TOOLS,
  ASSISTANT_TOOLS,
  executeAssistantToolDomain,
  executeAssistantWriteToolDomain,
  type AssistantToolContext,
  type AssistantToolExecution,
  type AssistantToolName,
} from './tools';

export type AssistantToolEffect = 'read' | 'compute' | 'external-read' | 'write';

export interface AssistantToolSecurityPolicy {
  effect: AssistantToolEffect;
  authorization: 'public-session' | 'domain-ownership' | 'customer-or-validated-contact';
  approval: 'not-required' | 'required';
  idempotency: 'not-required' | 'required';
  allowedExecutionLanes: readonly ['active'];
}

/** Every model-visible tool is explicitly classified. Missing entries fail closed. */
export const ASSISTANT_TOOL_SECURITY_POLICIES: Readonly<Record<AssistantToolName, AssistantToolSecurityPolicy>> = {
  get_order_status: {
    effect: 'read', authorization: 'domain-ownership', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  calculate_price: {
    effect: 'compute', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  search_products: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  lens_search: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  identify_product: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  match_product: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  detect_products: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  decode_product_code: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  extract_product_from_url: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  search_similar_products: {
    effect: 'external-read', authorization: 'public-session', approval: 'not-required',
    idempotency: 'not-required', allowedExecutionLanes: ['active'],
  },
  escalate_to_human: {
    effect: 'write', authorization: 'customer-or-validated-contact', approval: 'not-required',
    idempotency: 'required', allowedExecutionLanes: ['active'],
  },
};

interface SecurityState {
  canonicalCallId: string;
  effect: AssistantToolEffect | 'unknown';
  authenticated: boolean;
  authorized: boolean;
  schemaValid: boolean;
  approval: CanonicalToolAudit['approval'];
  idempotencyKey?: string;
}

const definitionsByName = new Map<string, (typeof ASSISTANT_TOOLS)[number]>(
  ASSISTANT_TOOLS.map((definition) => [definition.name, definition]),
);

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function bounded(value: unknown, maximum = 180): string {
  return String(value || '').slice(0, maximum);
}

function validId(value: unknown, minimum = 1, maximum = 180): boolean {
  const text = String(value || '');
  return text.length >= minimum && text.length <= maximum && /^[A-Za-z0-9._:@+-]+$/.test(text);
}

function canonicalCallId(call: CanonicalToolCall, context: AssistantToolContext): string {
  const material = [
    bounded(context.conversationId),
    bounded(context.turnId),
    bounded(call.name),
    bounded(call.id, 512),
  ].join('\u001f');
  return `tool_${hash(material).slice(0, 40)}`;
}

function serverIdempotencyKey(call: CanonicalToolCall, context: AssistantToolContext): string {
  // Never trust a model/provider-supplied `call.idempotencyKey`.
  const material = [
    'assistant-tool-idempotency-v1',
    bounded(context.conversationId),
    bounded(context.turnId),
    bounded(call.name),
    bounded(call.id, 512),
  ].join('\u001f');
  return `idem_${hash(material)}`;
}

function principal(context: AssistantToolContext): {
  type: 'customer' | 'guest-session' | 'invalid';
  hash: string;
  authenticated: boolean;
} {
  const sessionValid = validId(context.sessionId, 8, 160);
  if (context.customer) {
    const active = context.customer.status === 'ACTIVE' && validId(context.customer.id, 1, 180) && sessionValid;
    return {
      type: active ? 'customer' : 'invalid',
      hash: active ? hash(`customer:${context.customer.id}`) : '',
      authenticated: active,
    };
  }
  return {
    type: sessionValid ? 'guest-session' : 'invalid',
    hash: sessionValid ? hash(`session:${context.sessionId}`) : '',
    authenticated: sessionValid,
  };
}

function validateArguments(definition: (typeof ASSISTANT_TOOLS)[number] | undefined, value: unknown): boolean {
  if (!definition || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  let serialized = '';
  try { serialized = JSON.stringify(value); } catch { return false; }
  if (serialized.length > 16_000) return false;

  const schema: any = definition.input_schema;
  const properties: Record<string, any> = schema.properties || {};
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.some((key) => !Object.hasOwn(properties, key) || ['__proto__', 'prototype', 'constructor'].includes(key))) return false;
  if ((schema.required || []).some((key: string) => !Object.hasOwn(value as object, key))) return false;

  for (const key of keys) {
    const rule = properties[key];
    const item = (value as Record<string, unknown>)[key];
    if (rule.type === 'string' && (typeof item !== 'string' || item.length > 4_096)) return false;
    if (rule.type === 'number' && (typeof item !== 'number' || !Number.isFinite(item))) return false;
    if (rule.type === 'boolean' && typeof item !== 'boolean') return false;
    if (Array.isArray(rule.enum) && !rule.enum.includes(item)) return false;
  }
  return true;
}

function approvalStatus(
  policy: AssistantToolSecurityPolicy | undefined,
  context: AssistantToolContext,
  callId: string,
  toolName: string,
): CanonicalToolAudit['approval'] {
  if (!policy) return 'denied';
  if (policy.approval === 'not-required') return 'not-required';
  const approval = context.toolApproval;
  if (!approval) return 'required';
  const valid = approval.toolName === toolName
    && approval.canonicalCallId === callId
    && validId(approval.approvalId, 8, 180)
    && validId(approval.approvedBy, 1, 180)
    && Number.isFinite(Date.parse(approval.expiresAt))
    && Date.parse(approval.expiresAt) > Date.now();
  return valid ? 'approved' : 'denied';
}

function safeAuditToolName(value: unknown): string {
  const toolName = bounded(value, 120);
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(toolName)
    ? toolName
    : `invalid_${hash(toolName).slice(0, 24)}`;
}

function writeAudit(
  context: AssistantToolContext,
  call: CanonicalToolCall,
  state: SecurityState,
  outcome: CanonicalToolAudit['outcome'],
  errorCode = '',
): string {
  const id = `tool_audit_${randomUUID()}`;
  const actor = principal(context);
  context.db.run(`INSERT INTO assistant_tool_audit (
    id,request_id,conversation_id,turn_id,canonical_call_id,proposal_call_hash,tool_name,effect,execution_lane,
    principal_type,principal_hash,authenticated,authorized,schema_valid,approval_status,idempotency_key,outcome,error_code,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  id,
  validId(context.requestId) ? context.requestId : '',
  validId(context.conversationId) ? context.conversationId : '',
  validId(context.turnId) ? context.turnId : '',
  state.canonicalCallId,
  hash(bounded(call.id, 512)),
  safeAuditToolName(call.name),
  state.effect,
  ['active', 'shadow', 'probe'].includes(context.executionLane) ? context.executionLane : 'probe',
  actor.type,
  actor.hash,
  state.authenticated ? 1 : 0,
  state.authorized ? 1 : 0,
  state.schemaValid ? 1 : 0,
  state.approval,
  state.idempotencyKey || '',
  outcome,
  bounded(errorCode, 100),
  new Date().toISOString());
  return id;
}

function auditContract(
  context: AssistantToolContext,
  state: SecurityState,
  outcome: CanonicalToolAudit['outcome'],
  auditId: string,
): CanonicalToolAudit {
  return {
    canonicalCallId: state.canonicalCallId,
    classification: state.effect,
    executionLane: context.executionLane,
    authenticated: state.authenticated,
    authorized: state.authorized,
    schemaValid: state.schemaValid,
    approval: state.approval,
    outcome,
    ...(state.idempotencyKey ? { idempotencyKey: state.idempotencyKey } : {}),
    auditId,
  };
}

function deniedExecution(
  context: AssistantToolContext,
  state: SecurityState,
  outcome: CanonicalToolAudit['outcome'],
  auditId: string,
  code: string,
): AssistantToolExecution {
  return {
    modelResult: {
      success: false,
      code,
      message: 'AYROVI a refusé cette proposition d’outil.',
    },
    audit: auditContract(context, state, outcome, auditId),
  };
}

function businessOutcome(execution: AssistantToolExecution): 'succeeded' | 'business-rejected' {
  return execution.modelResult?.success === false ? 'business-rejected' : 'succeeded';
}

export function assistantToolPolicyCoverage(): {
  definitions: string[];
  policies: string[];
  missing: string[];
  extra: string[];
} {
  const definitions = ASSISTANT_TOOLS.map((tool) => tool.name).sort();
  const policies = Object.keys(ASSISTANT_TOOL_SECURITY_POLICIES).sort();
  return {
    definitions,
    policies,
    missing: definitions.filter((name) => !policies.includes(name)),
    extra: policies.filter((name) => !definitions.includes(name as AssistantToolName)),
  };
}

export function assistantWriteToolSecurityReadiness(): {
  ready: boolean;
  mutatingTools: string[];
  blockers: string[];
} {
  const coverage = assistantToolPolicyCoverage();
  const mutating = Object.entries(ASSISTANT_TOOL_SECURITY_POLICIES)
    .filter(([, policy]) => policy.effect === 'write');
  const blockers = [
    ...(coverage.missing.length ? ['UNCLASSIFIED_TOOLS'] : []),
    ...(coverage.extra.length ? ['ORPHAN_POLICIES'] : []),
    ...(!mutating.length ? ['NO_MUTATING_TOOL_CLASSIFICATION'] : []),
    ...(mutating.some(([, policy]) => policy.idempotency !== 'required') ? ['WRITE_IDEMPOTENCY_NOT_REQUIRED'] : []),
    ...(mutating.some(([, policy]) => policy.allowedExecutionLanes.length !== 1
      || policy.allowedExecutionLanes[0] !== 'active') ? ['NONACTIVE_WRITE_ALLOWED'] : []),
    ...(mutating.map(([name]) => name).sort().join(',')
      !== [...ASSISTANT_SYNCHRONOUS_WRITE_TOOLS].sort().join(',') ? ['WRITE_DISPATCH_MISMATCH'] : []),
  ];
  return {
    ready: blockers.length === 0,
    mutatingTools: mutating.map(([name]) => name),
    blockers,
  };
}

/**
 * Server-owned security boundary. A model emits a proposal only; AYROVI then
 * classifies, authenticates, authorizes, validates, checks approval and
 * idempotency, executes domain rules, and writes a canonical audit trail.
 */
export class AssistantToolGateway implements AiToolGateway<AssistantToolContext> {
  readonly definitions: readonly AiToolDefinition[] = ASSISTANT_TOOLS
    .filter((tool) => Boolean(ASSISTANT_TOOL_SECURITY_POLICIES[tool.name]))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        ...(tool.input_schema as unknown as Record<string, unknown>),
        additionalProperties: false,
      },
    }));

  async execute(call: CanonicalToolCall, context: AssistantToolContext): Promise<AssistantToolExecution> {
    const proposedName = String(call?.name || '');
    const definition = definitionsByName.get(proposedName);
    const policy = Object.hasOwn(ASSISTANT_TOOL_SECURITY_POLICIES, proposedName)
      ? ASSISTANT_TOOL_SECURITY_POLICIES[proposedName as AssistantToolName]
      : undefined;
    const actor = principal(context);
    const callId = canonicalCallId(call || ({} as CanonicalToolCall), context);
    const schemaValid = validId(call?.id, 1, 200)
      && validId(call?.name, 1, 120)
      && validateArguments(definition, call?.arguments);
    const contextValid = validId(context.requestId)
      && validId(context.conversationId)
      && validId(context.turnId)
      && ['active', 'shadow', 'probe'].includes(context.executionLane);
    const allowedLane = Boolean(policy?.allowedExecutionLanes.includes(context.executionLane as 'active'));
    const approval = approvalStatus(policy, context, callId, String(call?.name || ''));
    const approvalAllowed = approval === 'not-required' || approval === 'approved';
    const state: SecurityState = {
      canonicalCallId: callId,
      effect: policy?.effect || 'unknown',
      authenticated: actor.authenticated && contextValid,
      authorized: Boolean(policy && actor.authenticated && contextValid && allowedLane && approvalAllowed),
      schemaValid,
      approval,
      ...(policy?.idempotency === 'required' ? { idempotencyKey: serverIdempotencyKey(call, context) } : {}),
    };

    let denialCode = '';
    if (!definition || !policy) denialCode = 'TOOL_NOT_DECLARED';
    else if (!allowedLane) denialCode = 'TOOL_EXECUTION_LANE_DENIED';
    else if (!state.authenticated) denialCode = 'TOOL_AUTHENTICATION_REQUIRED';
    else if (!schemaValid) denialCode = 'TOOL_SCHEMA_INVALID';
    else if (!approvalAllowed) denialCode = 'TOOL_APPROVAL_REQUIRED';
    else if (policy.effect === 'write' && policy.idempotency !== 'required') denialCode = 'TOOL_IDEMPOTENCY_POLICY_REQUIRED';

    if (denialCode) {
      state.authorized = false;
      const auditId = writeAudit(context, call, state, 'denied', denialCode);
      return deniedExecution(context, state, 'denied', auditId, denialCode);
    }

    // This pre-execution audit is fail-closed: if it cannot be persisted, the
    // domain function (and therefore any write) is never invoked.
    writeAudit(context, call, state, 'authorized');

    if (policy.effect === 'write') {
      const idempotencyKey = state.idempotencyKey!;
      const now = new Date().toISOString();
      const reservation = context.db.run(`INSERT OR IGNORE INTO assistant_tool_idempotency
        (idempotency_key,canonical_call_id,conversation_id,turn_id,tool_name,status,result_json,created_at,updated_at)
        VALUES (?,?,?,?,?,'pending','',?,?)`,
      idempotencyKey, callId, context.conversationId, context.turnId, call.name, now, now);
      if (reservation.changes === 0) {
        const existing = context.db.get<any>(
          'SELECT status,result_json FROM assistant_tool_idempotency WHERE idempotency_key=?',
          idempotencyKey,
        );
        if (existing?.status === 'completed' && existing.result_json) {
          try {
            const replayed = JSON.parse(existing.result_json) as AssistantToolExecution;
            const auditId = writeAudit(context, call, state, 'replayed');
            return { ...replayed, audit: auditContract(context, state, 'replayed', auditId) };
          } catch { /* corrupted canonical result fails closed below */ }
        }
        const code = existing?.status === 'pending'
          ? 'TOOL_EXECUTION_IN_PROGRESS'
          : 'TOOL_EXECUTION_REVIEW_REQUIRED';
        const deniedState = { ...state, authorized: false };
        const auditId = writeAudit(context, call, deniedState, 'denied', code);
        return deniedExecution(context, deniedState, 'denied', auditId, code);
      }

      try {
        // The current write dispatcher is synchronous by construction. Domain
        // writes, idempotency completion and final audit commit atomically.
        return context.db.transaction(() => {
          const execution = executeAssistantWriteToolDomain(
            call.name as AssistantToolName,
            call.arguments,
            context,
          );
          const serialized = JSON.stringify(execution);
          if (serialized.length > 64_000) throw new Error('TOOL_RESULT_TOO_LARGE');
          context.db.run(`UPDATE assistant_tool_idempotency
            SET status='completed',result_json=?,updated_at=? WHERE idempotency_key=?`,
          serialized, new Date().toISOString(), idempotencyKey);
          const outcome = businessOutcome(execution);
          const errorCode = outcome === 'business-rejected' ? bounded(execution.modelResult?.code, 100) : '';
          const auditId = writeAudit(context, call, state, outcome, errorCode);
          return { ...execution, audit: auditContract(context, state, outcome, auditId) };
        });
      } catch (error) {
        context.db.run(
          "UPDATE assistant_tool_idempotency SET status='failed',updated_at=? WHERE idempotency_key=?",
          new Date().toISOString(),
          idempotencyKey,
        );
        const knownCode = error instanceof Error && error.message === 'TOOL_RESULT_TOO_LARGE'
          ? 'TOOL_RESULT_TOO_LARGE'
          : 'TOOL_EXECUTION_FAILED';
        const auditId = writeAudit(context, call, state, 'failed', knownCode);
        return deniedExecution(context, state, 'failed', auditId, knownCode);
      }
    }

    let execution: AssistantToolExecution;
    try {
      execution = await executeAssistantToolDomain(call.name, call.arguments, context);
    } catch {
      const auditId = writeAudit(context, call, state, 'failed', 'TOOL_EXECUTION_FAILED');
      return deniedExecution(context, state, 'failed', auditId, 'TOOL_EXECUTION_FAILED');
    }

    const outcome = businessOutcome(execution);
    const errorCode = outcome === 'business-rejected' ? bounded(execution.modelResult?.code, 100) : '';
    const auditId = writeAudit(context, call, state, outcome, errorCode);
    return { ...execution, audit: auditContract(context, state, outcome, auditId) };
  }
}

let singleton: AssistantToolGateway | null = null;

export function getAssistantToolGateway(): AssistantToolGateway {
  if (!singleton) singleton = new AssistantToolGateway();
  return singleton;
}
