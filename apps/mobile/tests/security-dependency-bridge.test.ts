import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const routerRequire = createRequire(appRequire.resolve('expo-router/package.json'));
const queryRequire = createRequire(routerRequire.resolve('query-string/package.json'));

describe('temporary SDK 57 security bridge', () => {
  it('loads the fixed decoder through the actual router dependency and parses URLs', () => {
    const query = queryRequire('query-string') as { parse(input: string): Record<string, unknown>; stringify(input: object): string };
    expect(query.parse('name=caf%C3%A9&size=40')).toEqual({ name: 'café', size: '40' });
    expect(query.parse('value=%E0%A4%A')).toEqual({ value: '%E0%A4%A' });
    expect(query.stringify({ name: 'café', size: '40' })).toContain('name=caf%C3%A9');
    const decoder = queryRequire('decode-uri-component') as { default: (s: string) => string };
    expect(decoder.default('%C3%A9')).toBe('é');
  });

  it('processes long malformed query values without the prior pathological stall', () => {
    const script = "const q=require('query-string'); const s='x='+'%E0%A4%A'.repeat(12000); q.parse(s);";
    expect(() => execFileSync(process.execPath, ['-e', script], { cwd: path.dirname(routerRequire.resolve('query-string/package.json')), timeout: 4000 })).not.toThrow();
  });

  it('blocks poisoned keys in each Expo and Jest deepmerge entry without breaking ordinary merges', () => {
    for (const consumer of ['@expo/config/package.json', 'jest-config/package.json']) {
      const consumerRequire = createRequire(appRequire.resolve(consumer));
      const pkg = consumerRequire.resolve('deepmerge/package.json');
      // index.js is unbundled source whose build-only helper is not published;
      // exercise the two bundled entry points actually loadable by consumers.
      for (const entry of ['dist/cjs.js', 'dist/umd.js']) {
        const merge = appRequire(path.join(path.dirname(pkg), entry)) as (a: unknown, b: unknown) => Record<PropertyKey, unknown>;
        const malicious = JSON.parse('{"__proto__":{"polluted":true},"safe":1}');
        const sym = Symbol('valid');
        for (const result of [merge(malicious, {}), merge(Object.create(null), malicious), merge({ nested: malicious }, {}), merge({}, { nested: malicious })]) {
          expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
          expect((result as { polluted?: boolean }).polluted).toBeUndefined();
          if (result.nested) expect((result.nested as { polluted?: boolean }).polluted).toBeUndefined();
        }
        const result = merge({ x: { a: 1 }, [sym]: 5 }, { x: { b: 2 } });
        expect(result.x).toEqual({ a: 1, b: 2 });
        expect(result[sym]).toBe(5);
        const getter = Object.create(null);
        Object.defineProperty(getter, '__proto__', { enumerable: true, get: () => { throw new Error('unsafe getter'); } });
        expect(() => merge(getter, {})).not.toThrow();
        expect(() => merge({}, getter)).not.toThrow();
      }
    }
  });

  it('keeps Expo CLI validation working with its scoped patched Zod override', () => {
    const cliRequire = createRequire(appRequire.resolve('@expo/cli/package.json'));
    const schemas = cliRequire('./build/src/start/server/DevToolsPlugin.schema.js') as { PluginSchema: { safeParse(value: unknown): { success: boolean } } };
    expect(schemas.PluginSchema.safeParse({ packageName: 'demo', packageRoot: '/tmp/demo' }).success).toBe(true);
    expect(schemas.PluginSchema.safeParse({ packageName: '', packageRoot: '/tmp/demo' }).success).toBe(false);
    const mcp = cliRequire('./build/src/start/server/createMCPDevToolsExtensionSchema.js') as { createMCPDevToolsExtensionSchema(value: unknown): { safeParse(value: unknown): { success: boolean } } };
    const schema = mcp.createMCPDevToolsExtensionSchema({ packageName: 'demo', cliExtensions: { commands: [{ name: 'open', title: 'Open', parameters: [{ name: 'count', type: 'number' }] }] } });
    expect(schema.safeParse({ command: 'open', count: 2 }).success).toBe(true);
    expect(schema.safeParse({ command: 'open', count: 'bad' }).success).toBe(false);
  });
});
