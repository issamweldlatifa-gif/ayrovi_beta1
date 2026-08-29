import type { AiMessage, AiUsage, AiWebSearchResult } from '../contracts';

export function textMessage(role: 'user' | 'assistant', text: string): AiMessage {
  return { role, content: [{ type: 'text', text }] };
}

export function textOfMessages(messages: AiMessage[]): string {
  return messages.flatMap((message) => message.content)
    .filter((part): part is Extract<(typeof messages)[number]['content'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export function emptyUsage(): AiUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    audioInputTokens: 0,
    audioOutputTokens: 0,
    imageInputTokens: 0,
    webSearchCalls: 0,
  };
}

export function dedupeWebResults(results: AiWebSearchResult[], limit = 20): AiWebSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (!/^https?:\/\//i.test(result.url) || seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  }).slice(0, limit);
}
