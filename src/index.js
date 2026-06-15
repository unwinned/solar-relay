import { RpcPool } from './core/rpc-pool.js';
import { endpoints } from './config.js';
import { createFeeEstimator } from './fees/estimator.js';
import { createOtelTelemetry } from './telemetry/otel.js';

const telemetry = createOtelTelemetry();
const pool = new RpcPool(endpoints, { telemetry });

for (let i = 0; i < 4; i++) {
  const result = await pool.execute((rpc) => rpc.getLatestBlockhash().send());
  console.log(`call ${i}: blockhash =`, result.value.blockhash.slice(0, 8));
}

const getFee = createFeeEstimator(pool);
console.log('Fee estimate:', await getFee());
console.log(pool.getHealthSnapshot());

await telemetry.shutdown();