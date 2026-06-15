import { describe, it, expect, vi } from 'vitest';
import { RpcPool } from '../src/core/rpc-pool.js';

describe('RpcPool telemetry hooks', () => {
  it('calls telemetry.recordLatency on success and recordFailure on failure', async () => {
    const telemetry = { recordLatency: vi.fn(), recordFailure: vi.fn() };

    const pool = new RpcPool(
      [
        { url: 'http://fake-1', label: 'a', weight: 1 },
        { url: 'http://fake-2', label: 'b', weight: 1 },
      ],
      { telemetry }
    );

    const failingRpc = pool.endpoints[0].rpc;

    await pool.execute((rpc) => {
      if (rpc === failingRpc) return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    });

    expect(telemetry.recordFailure).toHaveBeenCalledWith('a');
    expect(telemetry.recordLatency).toHaveBeenCalledWith('b', expect.any(Number));
  });

  it('works without telemetry option (noop)', async () => {
    const pool = new RpcPool([{ url: 'http://fake-1', label: 'a', weight: 1 }]);
    const result = await pool.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});