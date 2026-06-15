export function createFeeEstimator(pool, { percentile = 0.5, cacheTtlMs = 10_000 } = {}) {
  let cache = { value: null, expiresAt: 0 };

  return async function getPriorityFeeEstimate() {
    const now = Date.now();
    if (cache.value !== null && cache.expiresAt > now) {
      return cache.value;
    }

    const recentFees = await pool.execute((rpc) => rpc.getRecentPrioritizationFees().send());

    const fees = recentFees
      .map((entry) => Number(entry.prioritizationFee))
      .sort((a, b) => a - b);

    const microLamports = fees.length > 0
      ? fees[Math.floor(fees.length * percentile)]
      : 0;

    const estimate = { microLamports, percentile, source: 'getRecentPrioritizationFees', fetchedAt: now };
    cache = { value: estimate, expiresAt: now + cacheTtlMs };
    return estimate;
  };
}