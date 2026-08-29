import { afterEach, describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { QatafoDatabase } from '../src/db/database';
import { SmartLinkScraper } from '../src/scraper/scraper';
import type { AssistantToolContext } from '../src/assistant/tools';
import {
  ASSISTANT_TOOL_SECURITY_POLICIES,
  AssistantToolGateway,
  assistantToolPolicyCoverage,
  assistantWriteToolSecurityReadiness,
} from '../src/assistant/toolGateway';

const databases: QatafoDatabase[] = [];
const scraper = new SmartLinkScraper();
const unique = (prefix: string) => `${prefix}-${randomUUID()}`;

function context(
  db: QatafoDatabase,
  overrides: Partial<AssistantToolContext> = {},
): AssistantToolContext {
  return {
    db,
    scraper,
    customer: null,
    sessionId: unique('session'),
    conversationId: unique('conversation'),
    requestId: unique('request'),
    turnId: unique('turn'),
    executionLane: 'active',
    messages: [{ role: 'user', text: 'Je confirme que je souhaite contacter le support.' }],
    imageAttachments: [],
    webSearchEnabled: false,
    ...overrides,
  };
}

function database(): QatafoDatabase {
  const db = new QatafoDatabase(':memory:');
  databases.push(db);
  return db;
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

describe('Assistant Tool Gateway security enforcement', () => {
  test('classifies every exposed tool and exposes strict schemas', () => {
    const coverage = assistantToolPolicyCoverage();
    expect(coverage.missing).toEqual([]);
    expect(coverage.extra).toEqual([]);
    expect(coverage.definitions).toEqual(coverage.policies);

    const writePolicies = Object.entries(ASSISTANT_TOOL_SECURITY_POLICIES)
      .filter(([, policy]) => policy.effect === 'write');
    expect(writePolicies).toEqual([
      ['escalate_to_human', expect.objectContaining({
        idempotency: 'required',
        allowedExecutionLanes: ['active'],
      })],
    ]);
    expect(assistantWriteToolSecurityReadiness()).toEqual({
      ready: true,
      mutatingTools: ['escalate_to_human'],
      blockers: [],
    });
    for (const definition of new AssistantToolGateway().definitions) {
      expect(definition.parameters).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
    }
  });

  test('default-denies undeclared tools and audits without dispatching them', async () => {
    const db = database();
    const result = await new AssistantToolGateway().execute({
      id: 'provider-call-unknown',
      name: 'toString',
      arguments: { address: 'untrusted' },
      idempotencyKey: 'model-controlled-key',
    }, context(db));

    expect(result.modelResult).toMatchObject({ success: false, code: 'TOOL_NOT_DECLARED' });
    expect(result.audit).toMatchObject({
      classification: 'unknown',
      authorized: false,
      outcome: 'denied',
    });
    expect(db.get<any>('SELECT COUNT(*) count FROM assistant_tool_audit')?.count).toBe(1);
  });

  test('rejects schema smuggling before the mutating domain function', async () => {
    const db = database();
    const result = await new AssistantToolGateway().execute({
      id: 'provider-call-schema',
      name: 'escalate_to_human',
      arguments: {
        reason: 'Besoin de support',
        contact: '98112233',
        account_id: 'attacker-controlled-account',
      },
    }, context(db));

    expect(result.modelResult).toMatchObject({ success: false, code: 'TOOL_SCHEMA_INVALID' });
    expect(result.audit).toMatchObject({ schemaValid: false, authorized: false });
    expect(db.get<any>('SELECT COUNT(*) count FROM assistant_support_tickets')?.count).toBe(0);
    expect(db.get<any>('SELECT COUNT(*) count FROM admin_notifications')?.count).toBe(0);
  });

  test.each(['shadow', 'probe'] as const)('%s can never invoke a write tool', async (executionLane) => {
    const db = database();
    const toolContext = context(db, { executionLane });
    const result = await new AssistantToolGateway().execute({
      id: `provider-call-${executionLane}`,
      name: 'escalate_to_human',
      arguments: { reason: 'Besoin de support', contact: '98112233' },
    }, toolContext);

    expect(result.modelResult).toMatchObject({ success: false, code: 'TOOL_EXECUTION_LANE_DENIED' });
    expect(result.audit).toMatchObject({
      executionLane,
      classification: 'write',
      authorized: false,
      outcome: 'denied',
    });
    expect(db.get<any>('SELECT COUNT(*) count FROM assistant_support_tickets')?.count).toBe(0);
    expect(db.get<any>('SELECT COUNT(*) count FROM admin_notifications')?.count).toBe(0);
    expect(db.get<any>('SELECT COUNT(*) count FROM ai_learning_events')?.count).toBe(0);
    expect(db.get<any>('SELECT execution_lane FROM assistant_tool_audit')?.execution_lane).toBe(executionLane);
  });

  test('derives canonical idempotency, executes once, replays once and audits both attempts', async () => {
    const db = database();
    const gateway = new AssistantToolGateway();
    const toolContext = context(db);
    const proposal = {
      id: 'provider-call-support-1',
      name: 'escalate_to_human',
      arguments: { reason: 'Réclamation livraison en retard', contact: '98112233' },
      idempotencyKey: 'model-controlled-key-must-be-ignored',
    } as const;

    const first = await gateway.execute(proposal, toolContext);
    const second = await gateway.execute(proposal, toolContext);

    expect(first.modelResult).toMatchObject({ success: true });
    expect(second.modelResult).toEqual(first.modelResult);
    expect(first.audit).toMatchObject({
      classification: 'write',
      authenticated: true,
      authorized: true,
      schemaValid: true,
      approval: 'not-required',
      outcome: 'succeeded',
    });
    expect(second.audit?.outcome).toBe('replayed');
    expect(first.audit?.canonicalCallId).toMatch(/^tool_[a-f0-9]{40}$/);
    expect(first.audit?.canonicalCallId).not.toContain(proposal.id);
    expect(first.audit?.idempotencyKey).toMatch(/^idem_[a-f0-9]{64}$/);
    expect(first.audit?.idempotencyKey).not.toContain('model-controlled');
    expect(second.audit?.idempotencyKey).toBe(first.audit?.idempotencyKey);

    expect(db.get<any>('SELECT COUNT(*) count FROM assistant_support_tickets')?.count).toBe(1);
    expect(db.get<any>('SELECT COUNT(*) count FROM admin_notifications')?.count).toBe(1);
    expect(db.get<any>('SELECT COUNT(*) count FROM ai_learning_events')?.count).toBe(1);
    expect(db.get<any>('SELECT COUNT(*) count FROM assistant_tool_idempotency')?.count).toBe(1);
    expect(db.get<any>('SELECT idempotency_key,status FROM assistant_tool_idempotency')).toMatchObject({
      idempotency_key: first.audit?.idempotencyKey,
      status: 'completed',
    });
    expect(db.all<any>('SELECT outcome FROM assistant_tool_audit ORDER BY rowid')
      .map((row) => row.outcome)).toEqual(['authorized', 'succeeded', 'authorized', 'replayed']);

    const auditColumns = db.all<any>('PRAGMA table_info(assistant_tool_audit)').map((row) => row.name);
    expect(auditColumns).not.toEqual(expect.arrayContaining([
      'arguments', 'prompt', 'provider_response', 'tool_result',
    ]));
  });

  test('requires a valid server-derived principal before any active write', async () => {
    const db = database();
    const result = await new AssistantToolGateway().execute({
      id: 'provider-call-auth',
      name: 'escalate_to_human',
      arguments: { reason: 'Besoin de support', contact: '98112233' },
    }, context(db, { sessionId: 'bad' }));

    expect(result.modelResult).toMatchObject({ success: false, code: 'TOOL_AUTHENTICATION_REQUIRED' });
    expect(result.audit).toMatchObject({ authenticated: false, authorized: false });
    expect(db.get<any>('SELECT COUNT(*) count FROM assistant_support_tickets')?.count).toBe(0);
  });
});
