export async function checkHealth(pool) {
  const start = Date.now();
  try {
    await pool.execute((rpc) => rpc.getLatestBlockhash().send());
    return { time: new Date().toLocaleTimeString(), result: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { time: new Date().toLocaleTimeString(), result: 'fail', latencyMs: Date.now() - start, error: err.message };
  }
}