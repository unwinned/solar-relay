import { RpcPool } from '../core/rpc-pool.js';
import { endpoints } from '../config.js';
import { createFeeEstimator } from '../fees/estimator.js';
import { checkHealth } from './health-check.js';

const POLL_INTERVAL_MS = 3000;
const HISTORY_LIMIT = 5;

async function main() {
  const pool = new RpcPool(endpoints);
  const getFee = createFeeEstimator(pool);
  const history = [];
  const signatureArg = process.argv[2];

  while (true) {
    const entry = await checkHealth(pool);
    history.unshift(entry);
    if (history.length > HISTORY_LIMIT) history.pop();

    console.clear();
    console.log('init: solar-relay - RPC Health Monitor\n');
    console.table(pool.getHealthSnapshot().map(({ url, ...rest }) => rest));

    console.log('\nFee estimate:', await getFee());

    console.log('\nRecent health checks:');
    console.table(history);

    if (signatureArg) {
      console.log(`\nTransaction status for ${signatureArg}:`);
      try {
        const statuses = await pool.execute((rpc) => rpc.getSignatureStatuses([signatureArg]).send());
        console.log(statuses.value[0] ?? 'not found');
      } catch (err) {
        console.log('error fetching status:', err.message);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();