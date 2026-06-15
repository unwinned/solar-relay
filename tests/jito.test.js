import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendTransactionViaJitoWithFallback } from '../src/mev/jito.js';

function mockFetchSequence(responses) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(() => {
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve({ json: () => Promise.resolve(response) });
  }));
}

describe('Jito MEV routing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns landed status when bundle confirms', async () => {
    mockFetchSequence([
      { result: 'bundle-123' },
      { result: { value: [{ bundle_id: 'bundle-123', confirmation_status: 'confirmed' }] } },
    ]);
    const pool = { execute: vi.fn() };

    const result = await sendTransactionViaJitoWithFallback({
      pool,
      signedTransactionsBase64: ['tx1', 'tipTx'],
      pollIntervalMs: 0,
      maxPollAttempts: 3,
    });

    expect(result.via).toBe('jito');
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('falls back to RPC when bundle never lands', async () => {
    mockFetchSequence([
      { result: 'bundle-456' },
      { result: { value: [{ bundle_id: 'bundle-456', confirmation_status: null }] } },
    ]);
    const pool = { execute: vi.fn().mockResolvedValue('signature-xyz') };

    const result = await sendTransactionViaJitoWithFallback({
      pool,
      signedTransactionsBase64: ['tx1', 'tipTx'],
      pollIntervalMs: 0,
      maxPollAttempts: 2,
    });

    expect(result.via).toBe('rpc-fallback');
    expect(result.signature).toBe('signature-xyz');
  });

  it('falls back to RPC when sendBundle itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ error: { message: 'jito unavailable' } }) })
    ));
    const pool = { execute: vi.fn().mockResolvedValue('signature-abc') };

    const result = await sendTransactionViaJitoWithFallback({
      pool,
      signedTransactionsBase64: ['tx1'],
      pollIntervalMs: 0,
      maxPollAttempts: 1,
    });

    expect(result.via).toBe('rpc-fallback');
    expect(result.signature).toBe('signature-abc');
  });
});