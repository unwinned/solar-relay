import { describe, it, expect } from 'vitest';
import { createWalletAdapterSigner } from '../src/wallet/adapter.js';

describe('createWalletAdapterSigner', () => {
  it('wraps a wallet-adapter-style wallet (Phantom/Solflare/Backpack) into a Kit-compatible signer', async () => {
    const mockWallet = {
      publicKey: { toString: () => 'FakePublicKeyAddress' },
      signTransaction: async (tx) => ({ ...tx, signed: true }),
    };

    const signer = createWalletAdapterSigner(mockWallet);

    expect(signer.address).toBe('FakePublicKeyAddress');

    const result = await signer.modifyAndSignTransactions([{ id: 1 }, { id: 2 }]);

    expect(result).toEqual([
      { id: 1, signed: true },
      { id: 2, signed: true },
    ]);
  });

  it('throws a clear error for invalid wallet objects', () => {
    expect(() => createWalletAdapterSigner({})).toThrow('Expected a wallet');
  });
});