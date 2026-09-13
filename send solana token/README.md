# TETRA Token Test Sender

A browser-only test page for sending an SPL or Token-2022 token through a Helius Solana RPC endpoint.

## Run

Serve the folder through a local HTTP server. Do not open `index.html` directly with `file://`.

```bash
npx serve .
```

Open the shown localhost address and enter:

1. Helius API key or complete RPC URL
2. Token mint address
3. Human-readable amount
4. Sender private key
5. Receiver wallet address

The sender pays the Solana transaction fee and, when necessary, the receiver's associated token-account creation cost.

## Security

- Use only a low-value burner wallet for this browser test.
- Do not deploy this page publicly with a real treasury wallet.
- The page does not use local storage, cookies, or analytics and clears the private-key field after a successful transfer.
- A production reward system must sign transactions in a protected backend such as Firebase Cloud Functions.
