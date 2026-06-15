import { describe, it, expect } from 'vitest';
import { RpcPool } from '../src/core/rpc-pool.js';

describe('@solana/kit (web3.js v2.0) compatibility', () => {
  it('creates a working RPC client and fetches a real blockhash from devnet', async () => {
    const pool = new RpcPool([
      { url: 'https://api.devnet.solana.com', label: 'devnet', weight: 1 },
    ]);

    const result = await pool.execute((rpc) => rpc.getLatestBlockhash().send());

    expect(result).toHaveProperty('value.blockhash');
    expect(typeof result.value.blockhash).toBe('string');
    expect(result.value.blockhash.length).toBeGreaterThan(30);
  }, 10_000); // таймаут увеличен — это реальный сетевой вызов
});