# solar-relay

A resilience layer for Solana dApps. It gives you smart RPC load balancing, automatic
fallback when nodes fail, MEV-aware transaction routing through Jito, dynamic fee
estimation, observability metrics, and a small CLI for watching everything in real time.
Built on `@solana/kit`, which is the renamed Solana web3.js v2.0.

## Why this exists

Solana RPC endpoints fail, rate limit, and slow down, especially when the network is busy.
solar-relay wraps your RPC calls in a pool that tracks endpoint health and switches to a
working node automatically. That data is also exposed through metrics and a live CLI, so
you can see what's happening instead of guessing why a transaction got stuck.

## Features

- Built on `@solana/kit` (web3.js v2.0), using its functional, modular API.
- A health aware RPC pool that picks endpoints by latency and weight, with an exponential
  moving average for latency and a circuit breaker that puts failing endpoints into
  cooldown.
- Automatic fallback: if one endpoint fails or times out, the request retries on the next
  healthy one.
- Jito/MEV routing: send a bundle through Jito's Block Engine, and if it doesn't land in
  time, fall back to sending the transaction through the RPC pool.
- Dynamic priority fee estimation using `getRecentPrioritizationFees`, with a small cache
  so you're not hammering the RPC.
- OpenTelemetry metrics for latency and failures per endpoint, which can be sent to
  Datadog or any OTel compatible backend.
- A wallet adapter bridge that wraps Phantom, Solflare, Backpack and similar wallets into
  a signer that `@solana/kit` understands.
- A diagnostics CLI that shows live endpoint health, fee estimates, and transaction
  status.

## Project layout
src/
config.js         reads .env and builds the list of RPC endpoints
index.js           demo entrypoint, wires everything together
core/rpc-pool.js   RpcPool: health tracking, selection, fallback, circuit breaker
fees/estimator.js  dynamic priority fee estimation with caching
mev/jito.js        Jito bundle submission with RPC fallback
telemetry/otel.js  OpenTelemetry metrics setup
wallet/adapter.js  wallet adapter to @solana/kit signer bridge
cli/               diagnostics CLI (health-check.js and index.js)
tests/               vitest suite, mostly unit tests plus one live integration test

## Getting started

```bash
git clone <your-repo-url>
cd solar-relay
npm install
cp .env.example .env
```

Then fill in your RPC URLs in `.env`. solar-relay doesn't care which network you point it
at, devnet, mainnet, or a mix of providers all work the same way.

SOLANA_PUBLIC_DEVNET_URL=https://api.devnet.solana.com
HELIUS_DEVNET_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
ANKR_DEVNET_URL=https://rpc.ankr.com/solana_devnet

For mainnet, just swap in mainnet URLs (for example
`https://api.mainnet-beta.solana.com`). No code changes needed.

## Using the RPC pool

```js
import { RpcPool } from './src/core/rpc-pool.js';
import { endpoints } from './src/config.js';

const pool = new RpcPool(endpoints);

const { value } = await pool.execute((rpc) => rpc.getLatestBlockhash().send());
console.log(value.blockhash);

console.log(pool.getHealthSnapshot());
```

`execute()` picks the healthiest endpoint, applies a timeout, and retries on the next one
if something goes wrong. After three failures in a row, an endpoint goes into cooldown
(with growing backoff) and is skipped until it recovers.

## Fee estimation

```js
import { createFeeEstimator } from './src/fees/estimator.js';

const getFee = createFeeEstimator(pool, { percentile: 0.5, cacheTtlMs: 10_000 });
const { microLamports } = await getFee();
```

## Jito/MEV routing

```js
import { sendTransactionViaJitoWithFallback } from './src/mev/jito.js';

const result = await sendTransactionViaJitoWithFallback({
  pool,
  signedTransactionsBase64: [mainTxBase64, tipTxBase64],
  maxPollAttempts: 5,
  pollIntervalMs: 2000,
});

// result.via === 'jito'          the bundle landed
// result.via === 'rpc-fallback'  it didn't land in time, sent via the RPC pool instead
```

The bundle goes to Jito's Block Engine at `mainnet.block-engine.jito.wtf`. One of the
transactions needs a transfer of at least 1000 lamports to one of Jito's tip accounts
(use `getTipAccounts()` to get the current list and pick one at random). The bundle status
is checked with `getBundleStatuses`, and if it doesn't confirm in time, the transaction is
sent through the regular RPC pool instead.

One thing worth saying clearly: Jito's Block Engine only exists on mainnet, there's no
devnet version. The module is built against the real mainnet API, and the tests cover all
three outcomes (bundle lands, bundle never lands, Block Engine is unreachable) by mocking
`fetch`.

## Telemetry

```js
import { createOtelTelemetry } from './src/telemetry/otel.js';
import { RpcPool } from './src/core/rpc-pool.js';

const telemetry = createOtelTelemetry({ serviceName: 'my-dapp' });
const pool = new RpcPool(endpoints, { telemetry });

// flush before the process exits
await telemetry.shutdown();
```

This records two metrics, both tagged with the endpoint label:

- `rpc_latency_ms`, a histogram of request latency on success
- `rpc_failures_total`, a counter of failures per endpoint

By default it prints to the console. To send to Datadog or any OTLP collector, swap the
exporter in `src/telemetry/otel.js`:

```js
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
const exporter = new OTLPMetricExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT });
```

Everything that calls `recordLatency`/`recordFailure` stays the same.

## Wallet adapter

Wallets like Phantom, Solflare and Backpack all expose the same shape through the Wallet
Standard: `{ publicKey, signTransaction }`. This wraps that into something `@solana/kit`
can use directly:

```js
import { createWalletAdapterSigner } from './src/wallet/adapter.js';

// in a browser app, e.g. with @solana/wallet-adapter-react
const signer = createWalletAdapterSigner(wallet.adapter);
// signer.address and signer.modifyAndSignTransactions(...) now work with @solana/kit
```

## CLI

```bash
npm run cli                  # live health dashboard, refreshes every 3 seconds
npm run cli -- <signature>   # also polls and shows the status of a transaction
```

Shows endpoint health (status, latency, failures, cooldown), the current fee estimate, and
a short history of recent health checks.

## Testing

```bash
npm test
npx vitest run --coverage
```

16 tests, 92% statement coverage (the bar was 90%). The resilience logic is tested by
simulating failure modes without touching the network:

- one endpoint fails, the request falls back to a healthy one
- one endpoint times out, same thing
- all endpoints fail, you get a clear error
- repeated failures trip the circuit breaker and put the endpoint in cooldown
- Jito bundle lands, never lands, or the Block Engine is unreachable, all three fall back
  correctly
- telemetry hooks fire on both success and failure

There's also one real integration test (`tests/kit-compat.test.js`) that hits Solana
devnet to confirm `@solana/kit` (web3.js v2.0) actually works end to end.

`src/index.js`, `src/cli/index.js`, `src/config.js` and `src/telemetry/otel.js` are thin
entrypoints and aren't unit tested directly, their logic is just wiring together the
modules above, which are tested.

## Real mainnet run

While testing against mainnet (PublicNode + Helius), Helius started failing on its free
tier mid-run. Here's what the pool did about it, unedited:

\```
call 0: blockhash = 4YFxR9sL
call 1: blockhash = 3yAc3Ru3
call 2: blockhash = BXH43JpC
call 3: blockhash = AQgLD5C9

[
  {
    label: 'solana-public',
    url: 'https://solana-rpc.publicnode.com',
    status: 'healthy',
    avgLatencyMs: 175.46,
    consecutiveFailures: 0,
    cooldownUntil: 0
  },
  {
    label: 'helius',
    url: 'https://mainnet.helius-rpc.com/?api-key=...',
    status: 'unhealthy',
    avgLatencyMs: 0,
    consecutiveFailures: 3,
    cooldownUntil: 1781528672116
  }
]
\```

Every call still returned a valid blockhash. `helius` tripped the circuit breaker after 3
failures and went into cooldown, `solana-public` picked up all the traffic, and
OpenTelemetry recorded `rpc_failures_total{endpoint="helius"}` alongside the latency
histogram for `solana-public`. Nothing leaked to the caller, nothing crashed.

## Real signed transaction (mainnet)

To prove the whole pipeline works end to end, not just RPC reads,
`scripts/mainnet-smoke-test.js` builds, signs, and sends a real transaction through the
resilient pool using `@solana/kit`: a self-transfer of 1000 lamports (costs only the
network fee, ~5000 lamports).

\```
Wallet address: Du5qmHP8jfm8JqRAKkT9jqmdHF9sufrjhfVKsfoZ6a4m
Signature: 4nNDfz3WyLYRuAitgF7pooMqe7Yen31wDnVBz6jjdmHYmZnqyqBsTPSoBYQnnZGaae4BF3WmFiYt9z9NncAiVAky
Sent! https://explorer.solana.com/tx/4nNDfz3WyLYRuAitgF7pooMqe7Yen31wDnVBz6jjdmHYmZnqyqBsTPSoBYQnnZGaae4BF3WmFiYt9z9NncAiVAky
Check 0: confirmed
\```

Run it yourself:

\```bash
node scripts/generate-wallet.js   # prints a fresh address + secret key
# fund the address with ~0.02 SOL, then add the secret key to .env as MAINNET_WALLET_SECRET_KEY
node --env-file=.env scripts/mainnet-smoke-test.js
\```

## What's not done yet

- Fee estimation only uses `getRecentPrioritizationFees` right now. A Helius or Triton
  priority fee API could be added as a second source.
- Jito routing is tested against mocked Block Engine responses. A funded mainnet wallet
  would let this run as a real end to end test.
- The wallet adapter is tested against a mock with the same shape as a real wallet. A
  small React example app would let it run against actual Phantom.
- Defaults point at devnet so it's free and safe to run. Switch the URLs in `.env` to
  mainnet for production use.

