import { describe, it, expect, vi } from 'vitest';
import { checkHealth } from '../src/cli/health-check.js';

describe('checkHealth', () => {
  it('returns ok result when pool.execute succeeds', async () => {
    const pool = { execute: vi.fn().mockResolvedValue({ value: { blockhash: 'abc' } }) };
    const result = await checkHealth(pool);
    expect(result.result).toBe('ok');
    expect(typeof result.latencyMs).toBe('number');
  });

  it('returns fail result when pool.execute throws', async () => {
    const pool = { execute: vi.fn().mockRejectedValue(new Error('all endpoints failed')) };
    const result = await checkHealth(pool);
    expect(result.result).toBe('fail');
    expect(result.error).toBe('all endpoints failed');
  });
});