# Public profiles

Owners of QRDX accounts can publish a name, an image, a bio and links for their
address. Creators of native tokens can publish an image, a description and links
for their token. QRDX Explorer is where people claim and edit them; QRDX Explorer,
QRDX Trade and QRDX Wallet show them.

A profile is a claim, not a verification. It proves that whoever holds the
address's key (or the token creator's key) said it, nothing more. Names are not
unique, and anyone can create a token and give it any image. Every surface marks
profile content as published by its owner, keeps curated names (known addresses,
verified assets) ahead of it, and keeps the "unverified" ring on unverified tokens
whatever their image.

## Where it lives

The relay worker (`relay/`, `qrdx-relay`) stores profiles in one SQLite Durable
Object per network (`relay/src/profiles-do.ts`), served at
`trade.qrdx.org/api/profiles/*`. The networks are the worker's `NETWORKS` var
(mainnet and testnet), which also gives the RPC used to look up token creators.

| Module | What |
|---|---|
| `relay/src/profile-claim.ts` | the claim format and field rules (pure; kept identical in qrdx-explorer `lib/profiles/claim.ts`) |
| `relay/src/profile-verify.ts` | signature checks (ML-DSA-65, EIP-191) |
| `relay/src/profiles-do.ts` | storage, HTTP routes, image proxy |
| `lib/server/profiles.ts` | the trade API's reader (token images and profiles on assets) |

## Claiming

The client builds a claim, the wallet signs its message, and the client POSTs it.

```ts
interface ProfileClaim {
  v: 1
  network: 'mainnet' | 'testnet'
  kind: 'account' | 'token'
  subject: string          // the account (0xPQ… or 0x…), or the token (0x…)
  signer: string           // the account itself, or the token's creator
  profile: ProfileFields | null   // null removes the profile
  issuedAt: number         // unix seconds
}
```

The signed message is readable text followed by the claim as one line of JSON:

```text
QRDX public profile

Publish this profile for my account 0xPQ23F4… on QRDX testnet. Anyone can see it. Signing sends no transaction and costs nothing.

Account: 0xPQ23F4…
Name: Satoshi Testnet
X: qrdx_org
Issued: 2026-10-07T16:02:11.000Z

{"v":1,"network":"testnet","kind":"account",…}
```

The relay parses the JSON, rebuilds the whole message from it with
`profileMessage()` and accepts only an exact match, so the readable part the
wallet showed can never differ from the data stored.

| Signer | Wallet method | Proof |
|---|---|---|
| `0xPQ…` | `qrdx_signPQMessage(message, address)` | ML-DSA-65 over `"\x19QRDX PQ Signed Message:\n" + byteLength + message`, with the public key; the address must be `0xPQ` + the first 32 bytes of keccak256(key) |
| `0x…` | `personal_sign(message, address)` | secp256k1 over EIP-191; the address is recovered from r ‖ s ‖ v |

The relay then requires:

- an account profile to be signed by the account itself;
- a token profile to be signed by the token's `creator` (`exchange_getToken` on the
  network's node);
- `issuedAt` within 15 minutes before and 5 minutes after the relay's clock;
- `issuedAt` newer than the stored claim for that subject. Removals are kept as
  tombstones, so an old signed claim can never be replayed over a newer one or a
  removal.

### Fields

All optional, at least one required. Normalised before signing (the client and
the relay run the same `normalizeProfile`).

| Field | Rule |
|---|---|
| `name` | accounts only; 1–32 characters after removing invisible and bidi characters; must contain a letter or digit; must not start with `0x` |
| `image` | `https://` URL on a public host name (no IP literals, no credentials, standard port) |
| `description` | up to 280 characters; line breaks kept |
| `website` | `http(s)://` URL, public host |
| `x`, `telegram`, `github` | handles; `@name` or a profile URL is accepted and reduced to the handle |
| `discord` | an invite code; `discord.gg/<code>` is accepted |

Tokens cannot set `name`: they keep their on-chain name and symbol.

## API

All under `https://trade.qrdx.org/api/profiles/v1/{network}`; CORS open.

| Request | Response |
|---|---|
| `GET /accounts/{address}` | a profile, or 404 |
| `GET /accounts?ids=a,b,…` | `{ profiles: { <lower-case address>: profile } }`, up to 100 |
| `GET /tokens` | every token profile, the same shape |
| `GET /tokens?ids=…`, `GET /tokens/{address}` | as for accounts |
| `GET /{accounts\|tokens}/{address}/proof` | `{ message, signature, publicKey, issuedAt }`, for anyone to check |
| `POST /accounts`, `POST /tokens` | body `{ message, signature, publicKey? }` → `{ ok, profile }` or `{ ok, removed }`; 400 malformed or expired, 401 bad signature, 403 not the creator, 409 not newer |
| `GET /image/{account\|token}/{address}?v={issuedAt}` | the profile image |

A profile:

```json
{ "kind": "account", "address": "0xpq23f4…", "signer": "0xPQ23F4…",
  "profile": { "name": "Satoshi Testnet", "x": "qrdx_org" },
  "imageUrl": "https://trade.qrdx.org/api/profiles/v1/testnet/image/account/0xpq23f4…?v=1791389905",
  "issuedAt": 1791389905, "updatedAt": 1791389905 }
```

### Images

Profiles store the owner's image URL, but clients always load the relay's copy
(`/image/…`). The relay fetches it, accepts only PNG, JPEG, GIF, WebP or AVIF up
to 2 MB (no SVG), and serves it with `Content-Security-Policy: default-src 'none';
sandbox` and `nosniff`, cached for a day. Visitors never contact the owner's host,
and `?v=` changes with every claim.

## Where profiles show

- **QRDX Explorer**: claim and edit on an account's or token's page, after linking
  QRDX Wallet (the extension, or a phone over QRDX Connect through this site's
  relay). Claimed names replace short addresses across the explorer; account and
  token pages show the image, bio and links.
- **QRDX Trade**: every API asset has `image` (the relay's copy, null when none);
  `GET /api/v1/assets/{asset}` adds `profile` (the creator's description and
  links). Token badges show the image; verified assets keep their own logos.
- **QRDX Wallet**: token images in the token list and the trading screens, in
  greyscale like every logo in the wallet.
