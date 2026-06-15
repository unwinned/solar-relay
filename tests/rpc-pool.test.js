import { describe, it, expect } from 'vitest';
import { RpcPool } from '../src/core/rpc-pool.js';

describe('RpcPool', () => {
  it('falls back to a healthy endpoint when the first one fails', async () => {
    const pool = new RpcPool([
      { url: 'http://fake-1', label: 'a', weight: 1 },
      { url: 'http://fake-2', label: 'b', weight: 1 },
    ]);

    const failingRpc = pool.endpoints[0].rpc;

    const result = await pool.execute((rpc) => {
      if (rpc === failingRpc) return Promise.reject(new Error('simulated failure'));
      return Promise.resolve('ok');
    });

    expect(result).toBe('ok');
    expect(pool.endpoints[0].health.consecutiveFailures).toBe(1);
    expect(pool.endpoints[1].health.consecutiveFailures).toBe(0);
  });

  it('falls back when an endpoint hangs longer than the timeout', async () => {
    const pool = new RpcPool([
      { url: 'http://fake-1', label: 'a', weight: 1 },
      { url: 'http://fake-2', label: 'b', weight: 1 },
    ]);

    const slowRpc = pool.endpoints[0].rpc;

    const result = await pool.execute((rpc) => {
      if (rpc === slowRpc) return new Promise(() => {});
      return Promise.resolve('ok');
    }, { timeoutMs: 50 });

    expect(result).toBe('ok');
  });

  it('throws a clear error when all endpoints fail', async () => {
    const pool = new RpcPool([{ url: 'http://fake-1', label: 'a', weight: 1 }]);

    await expect(
      pool.execute(() => Promise.reject(new Error('boom')))
    ).rejects.toThrow('All RPC endpoints failed');
  });

  it('puts an endpoint into cooldown after repeated failures', () => {
    const pool = new RpcPool([
      { url: 'http://fake-1', label: 'a', weight: 1 },
      { url: 'http://fake-2', label: 'b', weight: 1 },
    ]);

    const endpointA = pool.endpoints[0];
    pool.recordFailure(endpointA);
    pool.recordFailure(endpointA);
    pool.recordFailure(endpointA);

    expect(endpointA.health.status).toBe('unhealthy');
    expect(endpointA.health.cooldownUntil).toBeGreaterThan(Date.now());
    expect(pool.pickEndpoint().config.label).toBe('b');
  });
});