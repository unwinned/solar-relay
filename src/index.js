import { RpcPool } from './core/rpc-pool.js';
import { endpoints } from './config.js';

const pool = new RpcPool(endpoints);

for (let i = 0; i < 4; i++) {
  const result = await pool.execute((rpc) => rpc.getLatestBlockhash().send());
  console.log(`call ${i}: blockhash =`, result.value.blockhash.slice(0, 8));
}
console.log(pool.getHealthSnapshot());