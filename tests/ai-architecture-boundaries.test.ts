import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['src', 'client/src'];
const FROZEN_LEGACY_VOICE_ALLOWLIST = new Set([
  'src/assistant/geminiLive.ts',
  'src/assistant/routes.ts',
]);

function sourceFiles(): string[] {
  const files: string[] = [];
  const visit = (relative: string) => {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(child);
    }
  };
  for (const root of SOURCE_ROOTS) visit(root);
  return files.sort();
}

function content(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function lineNumber(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function violationsFor(pattern: RegExp, allowed: (file: string) => boolean): string[] {
  const violations: string[] = [];
  for (const file of sourceFiles()) {
    if (allowed(file)) continue;
    const text = content(file);
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      violations.push(`${file}:${lineNumber(text, match.index)}:${match[0]}`);
      if (!pattern.global) break;
    }
  }
  return violations;
}

const insideAiCore = (file: string) => file.startsWith('src/ai-core/');
const insideProviderAdapter = (file: string) => file.startsWith('src/ai-core/adapters/');
const insideProviderTransportBoundary = (file: string) => (
  insideProviderAdapter(file) || FROZEN_LEGACY_VOICE_ALLOWLIST.has(file)
);

describe('AI architecture boundaries', () => {
  test('locks the frozen legacy Voice exception to exactly two reviewed files', () => {
    expect([...FROZEN_LEGACY_VOICE_ALLOWLIST].sort()).toEqual([
      'src/assistant/geminiLive.ts',
      'src/assistant/routes.ts',
    ]);
    for (const file of FROZEN_LEGACY_VOICE_ALLOWLIST) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} must remain explicit`).toBe(true);
    }
  });

  test('keeps provider HTTP transports and permanent provider secrets inside AI Core or frozen Voice', () => {
    const providerTransport = /https:\/\/(?:api\.(?:anthropic|openai|groq)\.com|generativelanguage\.googleapis\.com)[^'"`\s]*/gi;
    const secrets = /\b(?:ANTHROPIC|OPENAI|GROQ|GEMINI|GOOGLE)_API_KEY\b/g;

    expect(violationsFor(providerTransport, insideProviderTransportBoundary)).toEqual([]);
    expect(violationsFor(secrets, (file) => insideAiCore(file) || FROZEN_LEGACY_VOICE_ALLOWLIST.has(file))).toEqual([]);
  });

  test('keeps Responses and Anthropic SSE/HTTP wire markers inside provider adapters', () => {
    const responseWire = /(?:api\.openai\.com\/v1\/responses|api\.anthropic\.com\/v1\/messages|anthropic-version|previous_response_id|response\.output_text\.delta|response\.function_call_arguments\.delta|content_block_(?:start|delta)|input_json_delta|web_search_\d{8})/g;
    expect(violationsFor(responseWire, insideProviderAdapter)).toEqual([]);
  });

  test('blocks provider SDKs and concrete adapter imports from UI and business code', () => {
    const providerSdkImport = /(?:from\s+['"](?:openai|@anthropic-ai\/sdk)['"]|require\(\s*['"](?:openai|@anthropic-ai\/sdk)['"]\s*\))/g;
    const concreteAdapterImport = /(?:from\s+['"][^'"]*ai-core\/adapters\/|require\(\s*['"][^'"]*ai-core\/adapters\/)/g;

    expect(violationsFor(providerSdkImport, insideProviderAdapter)).toEqual([]);
    expect(violationsFor(concreteAdapterImport, insideAiCore)).toEqual([]);
  });

  test('keeps provider session/response identities out of canonical persistence contracts', () => {
    const canonicalFiles = [
      'src/db/database.ts',
      'src/ayrovix/types.ts',
      'src/assistant/types.ts',
    ].filter((file) => fs.existsSync(path.join(ROOT, file)));
    const forbiddenCanonicalIdentity = /\b(?:previous_response_id|provider_session_id|provider_response_id|openai_response_id|anthropic_message_id)\b/gi;
    const violations: string[] = [];
    for (const file of canonicalFiles) {
      const text = content(file);
      forbiddenCanonicalIdentity.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = forbiddenCanonicalIdentity.exec(text))) {
        violations.push(`${file}:${lineNumber(text, match.index)}:${match[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
