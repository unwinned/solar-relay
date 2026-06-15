export function createWalletAdapterSigner(wallet) {
  if (!wallet?.publicKey || typeof wallet.signTransaction !== 'function') {
    throw new Error('Expected a wallet with publicKey and signTransaction (Phantom/Solflare/Backpack-style)');
  }

  return {
    address: wallet.publicKey.toString(),
    async modifyAndSignTransactions(transactions) {
      const signed = [];
      for (const tx of transactions) {
        signed.push(await wallet.signTransaction(tx));
      }
      return signed;
    },
  };
}