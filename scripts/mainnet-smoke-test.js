import 'dotenv/config';
import {
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { RpcPool } from '../src/core/rpc-pool.js';
import { endpoints } from '../src/config.js';

async function main() {
  const secretKeyBytes = new Uint8Array(Buffer.from(process.env.MAINNET_WALLET_SECRET_KEY, 'base64'));
  const signer = await createKeyPairSignerFromBytes(secretKeyBytes);
  console.log('Wallet address:', signer.address);

  const pool = new RpcPool(endpoints);

  const { value: latestBlockhash } = await pool.execute((rpc) => rpc.getLatestBlockhash().send());

  // self-transfer of 1000 lamports - cheapest meaningful instruction (costs only the network fee)
  const transferInstruction = getTransferSolInstruction({
    source: signer,
    destination: signer.address,
    amount: 1000n,
  });

  let message = createTransactionMessage({ version: 0 });
  message = setTransactionMessageFeePayerSigner(signer, message);
  message = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message);
  message = appendTransactionMessageInstructions([transferInstruction], message);

  const signedTransaction = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signedTransaction);
  const base64Tx = getBase64EncodedWireTransaction(signedTransaction);

  console.log('Signature:', signature);

  await pool.execute((rpc) => rpc.sendTransaction(base64Tx, { encoding: 'base64' }).send());
  console.log(`Sent! https://explorer.solana.com/tx/${signature}`);

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statuses = await pool.execute((rpc) => rpc.getSignatureStatuses([signature]).send());
    const status = statuses.value[0];
    console.log(`Check ${i}:`, status?.confirmationStatus ?? 'pending');
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') break;
  }
}

main();