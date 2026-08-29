import type { AiToolDefinition, AiToolGateway, CanonicalToolCall } from '../ai-core/contracts';
import {
  ASSISTANT_TOOLS,
  executeAssistantTool,
  type AssistantToolContext,
  type AssistantToolExecution,
} from './tools';

/**
 * Server-owned boundary between model proposals and AYROVI business tools.
 * Authentication, ownership, pricing and validation remain implemented by the
 * existing domain functions during behavior-preserving Phase 1.
 */
export class AssistantToolGateway implements AiToolGateway<AssistantToolContext> {
  readonly definitions: readonly AiToolDefinition[] = ASSISTANT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema as unknown as Record<string, unknown>,
  }));

  async execute(call: CanonicalToolCall, context: AssistantToolContext): Promise<AssistantToolExecution> {
    return executeAssistantTool(call.name, call.arguments, context);
  }
}

let singleton: AssistantToolGateway | null = null;

export function getAssistantToolGateway(): AssistantToolGateway {
  if (!singleton) singleton = new AssistantToolGateway();
  return singleton;
}
