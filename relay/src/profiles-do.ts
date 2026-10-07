/**
 * Public profiles of accounts and tokens (docs/PROFILES.md): one SQLite Durable
 * Object per network, written only with a verified owner's signature.
 *
 *   GET  /api/profiles/v1/{network}/accounts/{address}       one profile (404 when none)
 *   GET  /api/profiles/v1/{network}/accounts?ids=a,b,…       up to 100, as a map
 *   GET  /api/profiles/v1/{network}/tokens[?ids=…]           every token profile, or those
 *   GET  /api/profiles/v1/{network}/{kind}s/{address}/proof  the signed message, for anyone to check
 *   POST /api/profiles/v1/{network}/{kind}s                  { message, signature, publicKey? }
 *   GET  /api/profiles/v1/{network}/image/{kind}/{address}   the profile image, proxied
 *
 * A removal is kept as a tombstone with its time, so an older signed claim can
 * never be replayed over it.
 */

import { DurableObject } from 'cloudflare:workers'
import {
  EVM_ADDRESS,
  IMAGE_TYPES,
  MAX_AGE_SEC,
  MAX_SKEW_SEC,
  NETWORK_NAME,
  ProfileClaim,
  ProfileError,
  ProfileFields,
  ProfileKind,
  PublicProfile,
  addressKey,
  isAddress,
  parseProfileMessage,
} from './profile-claim'
import { verifySigner } from './profile-verify'
import { json, type Env } from './worker'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_BATCH = 100

interface Row {
  kind: ProfileKind
  subject: string
  signer: string
  data: string | null
  issued_at: number
  updated_at: number
  proof: string
}

export class Profiles extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS profiles (
         kind TEXT NOT NULL, subject TEXT NOT NULL, signer TEXT NOT NULL, data TEXT,
         issued_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, proof TEXT NOT NULL,
         PRIMARY KEY (kind, subject))`
    )
  }

  private row(kind: ProfileKind, subject: string): Row | undefined {
    return this.sql.exec<Row & Record<string, SqlStorageValue>>('SELECT * FROM profiles WHERE kind = ? AND subject = ?', kind, subject).toArray()[0]
  }

  async get(kind: ProfileKind, subject: string): Promise<Row | null> {
    const r = this.row(kind, subject)
    return r && r.data ? r : null
  }

  async many(kind: ProfileKind, subjects: string[]): Promise<Row[]> {
    if (!subjects.length) return []
    const marks = subjects.map(() => '?').join(',')
    return this.sql
      .exec<Row & Record<string, SqlStorageValue>>(`SELECT * FROM profiles WHERE kind = ? AND data IS NOT NULL AND subject IN (${marks})`, kind, ...subjects)
      .toArray()
  }

  async all(kind: ProfileKind, limit: number): Promise<Row[]> {
    return this.sql
      .exec<Row & Record<string, SqlStorageValue>>('SELECT * FROM profiles WHERE kind = ? AND data IS NOT NULL ORDER BY updated_at DESC LIMIT ?', kind, limit)
      .toArray()
  }

  /**
   * Store a verified claim if it is newer than what is there. Atomic within the object.
   * Returns rather than throws a conflict: errors lose their class crossing the RPC boundary.
   */
  async put(claim: ProfileClaim, proof: string): Promise<{ row: Row | null } | { conflict: true }> {
    const subject = addressKey(claim.subject)
    const prev = this.row(claim.kind, subject)
    if (prev && prev.issued_at >= claim.issuedAt) return { conflict: true }
    const now = Math.floor(Date.now() / 1000)
    this.sql.exec(
      'INSERT OR REPLACE INTO profiles (kind, subject, signer, data, issued_at, updated_at, proof) VALUES (?, ?, ?, ?, ?, ?, ?)',
      claim.kind,
      subject,
      claim.signer,
      claim.profile ? JSON.stringify(claim.profile) : null,
      claim.issuedAt,
      now,
      proof
    )
    return { row: claim.profile ? this.row(claim.kind, subject)! : null }
  }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function networks(env: Env): Record<string, string> {
  try {
    return JSON.parse(env.NETWORKS || '{}')
  } catch {
    return {}
  }
}

const kindOf = (plural: string): ProfileKind | null => (plural === 'accounts' ? 'account' : plural === 'tokens' ? 'token' : null)

function publicView(base: string, network: string, r: Row): PublicProfile {
  const profile = JSON.parse(r.data!) as ProfileFields
  return {
    kind: r.kind,
    address: r.subject,
    signer: r.signer,
    profile,
    imageUrl: profile.image ? `${base}/v1/${network}/image/${r.kind}/${r.subject}?v=${r.issued_at}` : null,
    issuedAt: r.issued_at,
    updatedAt: r.updated_at,
  }
}

/** The token's creator, from the network's node. */
async function tokenCreator(rpcUrl: string, token: string): Promise<string | null> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'exchange_getToken', params: [token] }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!res?.ok) throw new ProfileError('the QRDX node is unreachable; try again', 503)
  const body = (await res.json().catch(() => null)) as { result?: { creator?: string } | null; error?: unknown } | null
  if (!body || body.error) return null
  return body.result?.creator ?? null
}

export async function profilesFetch(req: Request, env: Env): Promise<Response> {
  try {
    return await route(req, env)
  } catch (e) {
    if (e instanceof ProfileError) return json({ error: e.message }, e.status)
    console.warn(`[profiles] ${(e as Error).message}`)
    return json({ error: 'profile service error' }, 500)
  }
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const m = /^(.*\/profiles)\/v1\/([^/]+)\/(accounts|tokens|image)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/(proof))?\/?$/.exec(url.pathname)
  if (!m) return json({ error: 'not found' }, 404)
  const [, prefix, network, section, a, b, proof] = m
  const rpc = networks(env)[network]
  if (!NETWORK_NAME.test(network) || !rpc) return json({ error: `unknown network ${network}` }, 404)
  const stub = env.PROFILES.get(env.PROFILES.idFromName(network))
  const base = `${url.origin}${prefix}`

  if (section === 'image') {
    const kind = a === 'account' || a === 'token' ? (a as ProfileKind) : null
    if (!kind || !b || !isAddress(b)) return json({ error: 'not found' }, 404)
    return image(await stub.get(kind, addressKey(b)))
  }

  const kind = kindOf(section)!
  if (req.method === 'POST') {
    if (a) return json({ error: 'POST to /' + section }, 405)
    return json(await submit(req, env, network, rpc, kind, base))
  }
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  if (a) {
    if (!isAddress(a) || b) return json({ error: 'not found' }, 404)
    const r = await stub.get(kind, addressKey(a))
    if (!r) return json({ error: 'no profile' }, 404, 30)
    if (proof) return json({ ...JSON.parse(r.proof), issuedAt: r.issued_at }, 200, 30)
    return json(publicView(base, network, r), 200, 30)
  }

  const ids = url.searchParams.get('ids')
  if (ids !== null) {
    const list = [...new Set(ids.split(',').map((s) => s.trim()).filter(isAddress).map(addressKey))].slice(0, MAX_BATCH)
    const rows = await stub.many(kind, list)
    return json({ profiles: Object.fromEntries(rows.map((r) => [r.subject, publicView(base, network, r)])) }, 200, 30)
  }
  if (kind !== 'token') return json({ error: 'ids= is required for accounts' }, 400)
  const rows = await stub.all('token', 2000)
  return json({ profiles: Object.fromEntries(rows.map((r) => [r.subject, publicView(base, network, r)])) }, 200, 30)
}

async function submit(req: Request, env: Env, network: string, rpc: string, kind: ProfileKind, base: string) {
  const body = (await req.json().catch(() => null)) as { message?: unknown; signature?: unknown; publicKey?: unknown } | null
  if (!body || typeof body.message !== 'string') throw new ProfileError('body must be { message, signature, publicKey? }')
  const claim = parseProfileMessage(body.message)
  if (claim.kind !== kind) throw new ProfileError(`this is a${claim.kind === 'account' ? 'n account' : ' token'} profile; POST it to /${claim.kind}s`)
  if (claim.network !== network) throw new ProfileError(`signed for ${claim.network}, sent to ${network}`)
  const now = Math.floor(Date.now() / 1000)
  if (claim.issuedAt < now - MAX_AGE_SEC) throw new ProfileError('this signature has expired; sign again')
  if (claim.issuedAt > now + MAX_SKEW_SEC) throw new ProfileError('issuedAt is in the future; check this device’s clock')

  verifySigner(claim.signer, body.message, body.signature, body.publicKey)

  if (kind === 'token') {
    if (!EVM_ADDRESS.test(claim.subject)) throw new ProfileError('subject is not a token address')
    const creator = await tokenCreator(rpc, claim.subject)
    if (!creator) throw new ProfileError(`no token ${claim.subject} on ${network}`, 404)
    if (addressKey(creator) !== addressKey(claim.signer)) throw new ProfileError('only the token’s creator can set its profile', 403)
  }

  const proof = JSON.stringify({ message: body.message, signature: body.signature, publicKey: body.publicKey ?? null })
  const res = await env.PROFILES.get(env.PROFILES.idFromName(network)).put(claim, proof)
  if ('conflict' in res) throw new ProfileError('a newer profile is already published for this address; sign again', 409)
  return res.row ? { ok: true, profile: publicView(base, network, res.row) } : { ok: true, removed: true }
}

/** The owner's image, fetched by the relay: visitors never contact the owner's host. */
async function image(r: Row | null): Promise<Response> {
  const src = r?.data ? (JSON.parse(r.data) as ProfileFields).image : undefined
  if (!src) return json({ error: 'no image' }, 404)
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(`https://profile-image.cache/${encodeURIComponent(src)}`)
  const hit = await cache.match(key)
  if (hit) return hit

  const res = await fetch(src, { headers: { accept: IMAGE_TYPES.join(', '), 'user-agent': 'QRDX-Profile-Images/1' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!res?.ok || !res.body) return json({ error: 'the image could not be fetched' }, 502, 60)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!IMAGE_TYPES.includes(type)) return json({ error: `not an image (${type || 'no type'}); use PNG, JPEG, GIF, WebP or AVIF` }, 415, 300)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return json({ error: 'image larger than 2 MB' }, 413, 300)
  const bytes = await readCapped(res.body, MAX_IMAGE_BYTES)
  if (!bytes) return json({ error: 'image larger than 2 MB' }, 413, 300)

  const out = new Response(bytes, {
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=86400',
      'content-security-policy': "default-src 'none'; sandbox",
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    },
  })
  await cache.put(key, out.clone()).catch(() => undefined)
  return out
}

async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
