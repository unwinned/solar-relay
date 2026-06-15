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
config.js         # reads .env, builds the endpoint list
index.js           # demo entrypoint wiring everything together
core/rpc-pool.js   # RpcPool: health tracking, selection, fallback, circuit breaker
fees/estimator.js  # dynamic priority fee estimation with caching
mev/jito.js        # Jito bundle submission + RPC fallback
telemetry/otel.js  # OpenTelemetry metrics setup
wallet/adapter.js  # wallet-adapter -> @solana/kit signer bridge
cli/               # diagnostics CLI (health-check.js + index.js)
tests/               # vitest suite (unit + one live integration test)

## Installation

```bash
git clone <your-repo-url>
cd solar-relay
npm install
cp .env.example .env
# fill in RPC URLs (see below)
```

## Configuration

`solar-relay` is network-agnostic - point `endpoints` at devnet, mainnet, or a mix of
providers. `.env.example`:
SOLANA_PUBLIC_DEVNET_URL=https://api.devnet.solana.com
HELIUS_DEVNET_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
ANKR_DEVNET_URL=https://rpc.ankr.com/solana_devnet

For mainnet, swap the URLs for mainnet equivalents (e.g.
`https://api.mainnet-beta.solana.com`, `https://mainnet.helius-rpc.com/?api-key=...`) -
no code changes required.

## Usage

### RPC pool with fallback

```js
import { RpcPool } from './src/core/rpc-pool.js';
import { endpoints } from './src/config.js';

const pool = new RpcPool(endpoints);

const { value } = await pool.execute((rpc) => rpc.getLatestBlockhash().send());
console.log(value.blockhash);

console.log(pool.getHealthSnapshot());
// [{ label, status, avgLatencyMs, consecutiveFailures, cooldownUntil }, ...]
```

`execute()` tries the healthiest available endpoint, applies a timeout, and falls back to
the next endpoint on error or timeout. After 3 consecutive failures an endpoint enters an
exponentially-growing cooldown and is skipped until it expires.

### Priority fee estimation

```js
import { createFeeEstimator } from './src/fees/estimator.js';

const getFee = createFeeEstimator(pool, { percentile: 0.5, cacheTtlMs: 10_000 });
const { microLamports } = await getFee();
```

### Jito/MEV routing with fallback

```js
import { sendTransactionViaJitoWithFallback } from './src/mev/jito.js';

const result = await sendTransactionViaJitoWithFallback({
  pool,
  signedTransactionsBase64: [mainTxBase64, tipTxBase64],
  maxPollAttempts: 5,
  pollIntervalMs: 2000,
});

// result.via === 'jito'         -> bundle landed
// result.via === 'rpc-fallback' -> bundle didn't land in time / Jito unreachable,
//                                   transaction sent via the RPC pool instead
```

**How it works:** the bundle (up to 5 signed transactions) is submitted to the Jito Block
Engine (`mainnet.block-engine.jito.wtf`). One transaction in the bundle must include a
transfer of at least 1000 lamports to one of Jito's tip accounts (use `getTipAccounts()` to
fetch the current list and pick one at random). The bundle status is polled via
`getBundleStatuses`; if it doesn't confirm within `maxPollAttempts`, the SDK transparently
falls back to sending the transaction through the resilient RPC pool.

**Important:** Jito's Block Engine is **mainnet-only** - there is no devnet equivalent.
The module is implemented against the real mainnet API and covered by tests that mock
`fetch` to simulate bundle confirmation, non-confirmation, and Block Engine unavailability
(all three trigger the documented behavior above).

### Telemetry (OpenTelemetry / Datadog)

```js
import { createOtelTelemetry } from './src/telemetry/otel.js';
import { RpcPool } from './src/core/rpc-pool.js';

const telemetry = createOtelTelemetry({ serviceName: 'my-dapp' });
const pool = new RpcPool(endpoints, { telemetry });

// ... later, to flush before exit
await telemetry.shutdown();
```

Exports two metrics, tagged by `endpoint` label:
- `rpc_latency_ms` (histogram) - per-request latency on success
- `rpc_failures_total` (counter) - failures per endpoint

By default this uses `ConsoleMetricExporter`. To export to **Datadog** (or any OTLP
collector), swap the exporter in `src/telemetry/otel.js`:

```js
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
const exporter = new OTLPMetricExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT });
```

The `recordLatency`/`recordFailure` interface - and everything that calls it - stays
unchanged.

### Wallet adapter

Any Wallet Standard wallet (Phantom, Solflare, Backpack, ...) exposes
`{ publicKey, signTransaction }`. Wrap it into a `@solana/kit`-compatible signer:

```js
import { createWalletAdapterSigner } from './src/wallet/adapter.js';

// in a browser app, e.g. with @solana/wallet-adapter-react:
const signer = createWalletAdapterSigner(wallet.adapter);
// signer.address and signer.modifyAndSignTransactions(...) are now Kit-compatible
```

### Diagnostics CLI

```bash
npm run cli                  # live health dashboard, refreshes every 3s
npm run cli -- <signature>   # also polls and prints the status of a given transaction
```

Shows endpoint health (status, latency, failures, cooldown), the current fee estimate, and
a rolling log of recent health checks.

## Testing

```bash
npm test                      # 16 tests
npx vitest run --coverage     # coverage report
```

**Coverage: 92% statements** (threshold: 90%). All resilience logic is covered by tests
that simulate real-world failure modes without touching the network:

- endpoint failure → fallback to a healthy endpoint
- endpoint timeout → fallback
- all endpoints failing → clear error
- repeated failures → circuit breaker / cooldown
- Jito bundle confirms / never lands / Block Engine unreachable → all three fallback paths
- telemetry hooks fire correctly on success and failure

One integration test (`tests/kit-compat.test.js`) makes a real call against Solana devnet
to verify `@solana/kit` (web3.js v2.0) compatibility end-to-end.

`src/index.js`, `src/cli/index.js`, `src/config.js`, and `src/telemetry/otel.js` are thin
entrypoints/glue and are intentionally excluded from unit coverage - their logic is
exercised via the modules above.

## Known limitations / roadmap

- Fee estimation currently uses on-chain `getRecentPrioritizationFees`; a Helius/Triton
  Priority Fee API source could be added as an additional estimator.
- Jito routing is implemented and tested via mocked Block Engine responses (mainnet-only
  infrastructure); a funded mainnet wallet would allow a live end-to-end bundle test.
- Wallet adapter is tested against a Wallet Standard-shaped mock; a browser/React example
  app would allow live Phantom testing.
- Default config targets Solana devnet for safe, free development; switch `endpoints` in
  `.env` to mainnet URLs for production use.