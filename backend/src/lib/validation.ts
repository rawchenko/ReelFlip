/** Matches a Solana base58-encoded public key (32–44 characters, no 0/O/I/l). */
export const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
