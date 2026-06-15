import { describe, it, expect, vi } from 'vitest';
import { createFeeEstimator } from '../src/fees/estimator.js';

describe('createFeeEstimator', () => {
  it('computes the median priority fee from recent fees', async () => {
    const fakePool = {
      execute: vi.fn().mockResolvedValue([
        { slot: 1n, prioritizationFee: 100n },
        { slot: 2n, prioritizationFee: 300n },
        { slot: 3n, prioritizationFee: 200n },
      ]),
    };

    const getFee = createFeeEstimator(fakePool);
    const estimate = await getFee();

    expect(estimate.microLamports).toBe(200);
    expect(estimate.source).toBe('getRecentPrioritizationFees');
  });

  it('caches the result within the TTL', async () => {
    const fakePool = {
      execute: vi.fn().mockResolvedValue([{ slot: 1n, prioritizationFee: 50n }]),
    };

    const getFee = createFeeEstimator(fakePool, { cacheTtlMs: 10_000 });
    await getFee();
    await getFee();

    expect(fakePool.execute).toHaveBeenCalledTimes(1);
  });
});