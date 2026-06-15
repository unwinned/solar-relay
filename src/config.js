import 'dotenv/config';

export const endpoints = [
  { url: process.env.SOLANA_PUBLIC_DEVNET_URL, label: 'solana-public', weight: 1 },
  { url: process.env.HELIUS_DEVNET_URL, label: 'helius', weight: 2 },
  { url: process.env.ANKR_DEVNET_URL, label: 'ankr', weight: 1 },
];