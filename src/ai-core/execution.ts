import type { AiExecutionLane } from './contracts';

export const CANONICAL_EXECUTION_LANE: AiExecutionLane = 'active';

export function isCanonicalExecutionLane(lane: AiExecutionLane = CANONICAL_EXECUTION_LANE): boolean {
  return lane === CANONICAL_EXECUTION_LANE;
}

export function isAuditExecutionLane(lane: AiExecutionLane): lane is 'shadow' | 'probe' {
  return lane === 'shadow' || lane === 'probe';
}

/** Fail closed when an operation that can mutate canonical state is misrouted. */
export function assertCanonicalExecutionLane(lane: AiExecutionLane, operation: string): void {
  if (!isCanonicalExecutionLane(lane)) {
    const error = new Error(`Canonical operation is forbidden in ${lane} execution.`);
    error.name = 'NonCanonicalExecutionError';
    Object.defineProperty(error, 'code', { enumerable: true, value: 'NON_CANONICAL_WRITE_FORBIDDEN' });
    Object.defineProperty(error, 'operation', { enumerable: false, value: operation });
    throw error;
  }
}

/**
 * Keeps a result lane-bound. The private value is omitted from JSON so a
 * Shadow/probe result cannot be accidentally sent to UI by serializing it.
 */
export class AiLaneBoundResult<T> {
  readonly auditOnly: boolean;
  #value: T;

  constructor(readonly executionLane: AiExecutionLane, value: T) {
    this.auditOnly = !isCanonicalExecutionLane(executionLane);
    this.#value = value;
  }

  canonicalValue(): T {
    assertCanonicalExecutionLane(this.executionLane, 'publish-result');
    return this.#value;
  }

  auditMap<R>(consumer: (value: T) => R): R {
    if (!isAuditExecutionLane(this.executionLane)) {
      throw new Error('Active results must use the canonical publication path.');
    }
    return consumer(this.#value);
  }

  toJSON(): { executionLane: AiExecutionLane; auditOnly: boolean } {
    return { executionLane: this.executionLane, auditOnly: this.auditOnly };
  }
}
