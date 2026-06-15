import { createSolanaRpc } from '@solana/kit';

export class RpcPool {
  constructor(endpointConfigs, { telemetry } = {}) {
      this.telemetry = telemetry ?? createNoopTelemetry();
      this.endpoints = endpointConfigs.map((config) => ({
        config,
        rpc: createSolanaRpc(config.url),
        health: {
          status: 'healthy',
          avgLatencyMs: 0,
          consecutiveFailures: 0,
          cooldownUntil: 0,
        },
      }));
    }

  pickEndpoint(excludeLabels = new Set()) {
      const now = Date.now();
      const available = this.endpoints.filter(
        (e) => e.health.cooldownUntil < now && !excludeLabels.has(e.config.label)
      );
      if (available.length === 0) return null;
  
      available.sort((a, b) => a.health.avgLatencyMs - b.health.avgLatencyMs);
      return available[0];
  }

  recordSuccess(endpoint, latencyMs) {
    const h = endpoint.health;
    h.avgLatencyMs = h.avgLatencyMs === 0 ? latencyMs : h.avgLatencyMs * 0.7 + latencyMs * 0.3;
    h.consecutiveFailures = 0;
    h.status = 'healthy';
    this.telemetry.recordLatency(endpoint.config.label, latencyMs);
  }

  recordFailure(endpoint) {
    const h = endpoint.health;
    h.consecutiveFailures += 1;
    if (h.consecutiveFailures >= 3) {
      const cooldownMs = Math.min(1000 * 2 ** (h.consecutiveFailures - 3), 30000);
      h.cooldownUntil = Date.now() + cooldownMs;
      h.status = 'unhealthy';
    } else {
      h.status = 'degraded';
      this.telemetry.recordFailure(endpoint.config.label);
    }
  }

  getHealthSnapshot() {
    return this.endpoints.map((e) => ({
      label: e.config.label,
      url: e.config.url,
      ...e.health,
    }));
  }

  async execute(fn, { timeoutMs = 5000 } = {}) {
    const triedLabels = new Set();
    let lastError = null;

    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const endpoint = this.pickEndpoint(triedLabels);
      if (!endpoint) break;
      triedLabels.add(endpoint.config.label);

      const start = Date.now();
      try {
        const result = await withTimeout(fn(endpoint.rpc), timeoutMs);
        this.recordSuccess(endpoint, Date.now() - start);
        return result;
      } catch (err) {
        this.recordFailure(endpoint);
        lastError = err;
      }
    }

    throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message ?? 'unknown'}`);
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('RPC request timed out')), ms)),
  ]);
}

function createNoopTelemetry() {
  return {
    recordLatency: () => {},
    recordFailure: () => {},
  };
}