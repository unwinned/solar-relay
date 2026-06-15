const DEFAULT_JITO_BASE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1';

const METHOD_PATHS = {
  sendBundle: 'bundles',
  getBundleStatuses: 'getBundleStatuses',
  getTipAccounts: 'getTipAccounts',
};

async function jitoRpcCall(baseUrl, method, params) {
  const path = METHOD_PATHS[method] ?? method;
  const response = await fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(`Jito ${method} error: ${json.error.message}`);
  }
  return json.result;
}

export function getTipAccounts(baseUrl = DEFAULT_JITO_BASE_URL) {
  return jitoRpcCall(baseUrl, 'getTipAccounts', []);
}

export function sendBundle(base64Transactions, baseUrl = DEFAULT_JITO_BASE_URL) {
  return jitoRpcCall(baseUrl, 'sendBundle', [base64Transactions, { encoding: 'base64' }]);
}

export function getBundleStatuses(bundleIds, baseUrl = DEFAULT_JITO_BASE_URL) {
  return jitoRpcCall(baseUrl, 'getBundleStatuses', [bundleIds]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTransactionViaJitoWithFallback({
  pool,
  signedTransactionsBase64,
  jitoBaseUrl = DEFAULT_JITO_BASE_URL,
  pollIntervalMs = 2000,
  maxPollAttempts = 5,
}) {
  let bundleId;
  try {
    bundleId = await sendBundle(signedTransactionsBase64, jitoBaseUrl);
  } catch (err) {
    return { via: 'rpc-fallback', reason: err.message, ...(await sendViaPool(pool, signedTransactionsBase64)) };
  }

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    await sleep(pollIntervalMs);
    const statuses = await getBundleStatuses([bundleId], jitoBaseUrl);
    const status = statuses?.value?.[0];
    if (status?.confirmation_status) {
      return { via: 'jito', bundleId, status };
    }
  }

  return { via: 'rpc-fallback', bundleId, reason: 'bundle did not land in time', ...(await sendViaPool(pool, signedTransactionsBase64)) };
}

async function sendViaPool(pool, signedTransactionsBase64) {
  const tx = signedTransactionsBase64[0];
  const signature = await pool.execute((rpc) => rpc.sendTransaction(tx, { encoding: 'base64' }).send());
  return { signature };
}