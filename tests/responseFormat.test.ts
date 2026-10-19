import { describe, it, expect } from 'vitest';
import { resolveTextJsonFormat } from '../src/utils/responseFormat.js';

describe('resolveTextJsonFormat', () => {
  it('prefers explicit query param', () => {
    expect(resolveTextJsonFormat('text', 'application/json')).toBe('text');
    expect(resolveTextJsonFormat('json', undefined)).toBe('json');
  });

  it('uses Accept header when format omitted', () => {
    expect(resolveTextJsonFormat(undefined, 'application/json')).toBe('json');
    expect(resolveTextJsonFormat(undefined, 'text/html, application/json')).toBe('json');
  });

  it('returns undefined when neither is set', () => {
    expect(resolveTextJsonFormat(undefined, undefined)).toBeUndefined();
  });
});
