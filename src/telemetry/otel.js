import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';

export function createOtelTelemetry({ serviceName = 'solar-relay', exportIntervalMs = 10_000 } = {}) {
  const exporter = new ConsoleMetricExporter();
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: exportIntervalMs });
  const provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);

  const meter = provider.getMeter(serviceName);

  const latencyHistogram = meter.createHistogram('rpc_latency_ms', {
    description: 'Latency of RPC requests in milliseconds',
    unit: 'ms',
  });

  const failureCounter = meter.createCounter('rpc_failures_total', {
    description: 'Total number of failed RPC requests',
  });

  return {
    recordLatency(endpointLabel, latencyMs) {
      latencyHistogram.record(latencyMs, { endpoint: endpointLabel });
    },
    recordFailure(endpointLabel) {
      failureCounter.add(1, { endpoint: endpointLabel });
    },
    shutdown: () => provider.shutdown(),
  };
}