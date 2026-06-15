import { generateKeyPairSync } from 'crypto';
import { createKeyPairSignerFromBytes } from '@solana/kit';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' });
const seed = privateDer.subarray(privateDer.length - 32);

const publicDer = publicKey.export({ type: 'spki', format: 'der' });
const pubBytes = publicDer.subarray(publicDer.length - 32);

const secretKey64 = new Uint8Array(Buffer.concat([seed, pubBytes]));
const signer = await createKeyPairSignerFromBytes(secretKey64);

console.log('Address:', signer.address);
console.log('Secret key (base64, save to .env as MAINNET_WALLET_SECRET_KEY):');
console.log(Buffer.from(secretKey64).toString('base64'));