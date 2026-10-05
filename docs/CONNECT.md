# QRDX Connect — trading from a phone wallet

QRDX Connect links a site (qrdx-trade on a laptop) to the QRDX Wallet running
somewhere else (the iPhone PWA, or the web wallet in another browser) by
scanning a QR code. It is the remote counterpart of the extension's injected
provider: the site gets an EIP-1193 provider, the wallet runs the same
`ProviderRouter` the extension runs, so permissions, approvals and signing are
identical. Only the transport differs.

```
 laptop: trade.qrdx.org                relay (Cloudflare DO)               phone: QRDX Wallet PWA
 RemoteProvider ──encrypted──▶  /api/relay/v1/{topic}  ──encrypted──▶  RemoteSessions → ProviderRouter
               ◀──encrypted──   mailbox per side, WS +  ◀──encrypted──   approvals on the phone
                                HTTP long-poll, attests                   signs with the phone's keys
                                the site's Origin
```

The relay forwards ciphertext. It cannot read requests, forge them, or alter
them; the most it can do is drop or delay messages.

## Pairing

1. The site creates a 32-byte random **key**. The **topic** is
   `hex(sha256(key))`. The site connects to the relay on the topic as `dapp`
   (the relay records the browser's `Origin` header from that connection), and
   shows a QR code of the **pairing link**:

   ```
   https://wallet.qrdx.org/wallet?connect=<urlencoded pairing URI>
   qrdx-connect:v1?k=<base64url key>&r=<relay base URL>&n=<site name>&u=<site URL>
   ```

   The link opens the wallet when scanned with the phone's camera (where the
   OS routes it there); the wallet's own scanner reads the same QR, and the
   link can also be pasted.

2. The site sends its first request, `qrdx_requestAccounts`. It waits in the
   relay's mailbox until the phone joins.

3. The wallet parses the URI, derives the topic, asks the relay for the
   session's attested origin (`GET /v1/{topic}`), and refuses unless it is
   present and equal to the origin of the URI's `u`. It then joins as `wallet`,
   processes the waiting request, and the router shows its usual connect
   approval for that origin. From then on every request goes through the
   router exactly as from the extension.

Anyone who sees the QR code can join the session, as with WalletConnect. The
wallet therefore asks for approval before sharing accounts, and its connect
screen says to approve only a code the user just scanned from their own screen.

## Messages

**Encryption.** AES-256-GCM with the pairing key; a fresh 12-byte IV per
message; additional data `qrdx-connect:v1:<topic>:<sender side>`, so a message
cannot be replayed to its sender or into another session. Wire payload:
`base64url(iv ‖ ciphertext)`. Both repos test the same vector
(`tests/unit/connect.test.ts`).

**Plaintext**, JSON:

| From | Message |
|---|---|
| site | `{ "t": "hello", "dapp": { "name", "url" } }` |
| site | `{ "t": "req", "id", "method", "params" }` |
| wallet | `{ "t": "hello", "wallet": { "name", "platform" } }` |
| wallet | `{ "t": "res", "id", "result" }` or `{ "t": "res", "id", "error": { "code", "message" } }` |
| wallet | `{ "t": "event", "event": "accountsChanged" \| "chainChanged" \| "disconnect", "data" }` |
| either | `{ "t": "bye" }` — the session is over |

Request ids are random; the wallet ignores an id it has already answered, so a
relay replay cannot make it sign twice.

## Relay API

Base URL: `https://trade.qrdx.org/api/relay` (the `relay/` worker, routed under
the trade site). `{topic}` is 64 hex characters; `side` is `dapp` or `wallet`.

| Request | |
|---|---|
| `GET /v1/{topic}/ws?side=` | WebSocket (below) |
| `POST /v1/{topic}/messages?side=` | `{ "payload" }` → `{ "seq" }`; queued for the other side |
| `GET /v1/{topic}/messages?side=&after=&wait=` | `{ "messages": [{ "seq", "payload", "at" }], "peer": { "online" } }`: messages for `side` after `after` (which also acknowledges everything up to it); `wait` (≤ 25 s) long-polls when there are none |
| `GET /v1/{topic}` | `{ "dappOrigin", "createdAt", "walletJoined" }` |
| `DELETE /v1/{topic}` | ends the session and deletes its messages |

WebSocket frames — server: `{"type":"message","seq","payload","at"}`,
`{"type":"peer","online"}`, `{"type":"published","ref","seq"}`,
`{"type":"error","message"}`; client: `{"type":"publish","payload","ref"}`,
`{"type":"ack","seq"}`. On connect the server sends every unacknowledged
message.

Limits: payloads up to 64 KiB, 256 queued messages per side, messages expire
after 24 h, an idle session after 7 days.

## Where things run

| Piece | Code |
|---|---|
| Relay | `relay/src/hub.ts` (logic, unit-tested), `relay/src/worker.ts` (Worker + Durable Object), `relay/wrangler.jsonc` |
| Site | `lib/connect/` (crypto, pairing, relay client), `lib/wallet/remote.ts` (EIP-1193 provider), `components/wallet/ConnectDialog.tsx` |
| Wallet | `src/core/connect/` (the same protocol code), `src/shared/remote-sessions.ts` (router + sessions), `components/wallet/connect/` (scanner, approvals, sessions) |

## Phones and sleep

iOS suspends a PWA in the background, closing its socket. Requests wait in
the relay mailbox; when the wallet comes back to the foreground it reconnects
and handles them, and the site keeps waiting meanwhile (up to 15 minutes per
request). The site shows when the phone is offline. The wallet's own locking
still applies: a locked wallet asks to be unlocked first.

## Deploying and developing

The relay is its own small Worker (`relay/wrangler.jsonc`), routed under the
trade site at `trade.qrdx.org/api/relay/*`. It cannot be a Pages / edge
function like the API: the phone and the laptop must meet in shared state, and
edge functions are stateless isolates (two requests rarely share one).
Cloudflare's shared state for this is a Durable Object, and only a Worker can
define one; Pages can bind to a Durable Object but cannot contain it.

It deploys with the site: `pnpm build:worker` builds the Pages output, then
runs `scripts/deploy-relay.mjs`, which deploys the relay when

- Cloudflare credentials are present (`CLOUDFLARE_API_TOKEN`, or a
  `wrangler login`); without them it prints a note and the build carries on;
- and, in a Cloudflare Pages build, the branch is the production branch
  (`QRDX_RELAY_BRANCH`, default `main`), so previews never replace the live
  relay. `pnpm deploy:preview` skips it too.

`QRDX_SKIP_RELAY_DEPLOY=1` turns it off. When it runs and fails, the build
fails. For Pages builds from Git, add `CLOUDFLARE_API_TOKEN` (permissions:
Workers Scripts Edit, Workers Routes Edit on `qrdx.org`) as an encrypted
variable in the Pages project's build settings. `pnpm relay:deploy` deploys
the relay alone.

Locally, `pnpm relay:dev` runs the real Durable Object in workerd on
`127.0.0.1:8787`. Point the site at it and at a locally served wallet:

```bash
NEXT_PUBLIC_QRDX_RELAY_URL=http://127.0.0.1:8787/api/relay \
NEXT_PUBLIC_QRDX_WALLET_URL=http://127.0.0.1:3200 pnpm dev
```

`tests/e2e/trade-phone.mjs` runs the whole flow in two browsers: pairing (and
decoding the QR as the iPhone scanner does), the network switch and an order
approved on the phone, the phone closing and coming back, a request that waits
while it is locked, and disconnecting.
