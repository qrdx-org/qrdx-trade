/**
 * Public profiles (docs/PROFILES.md): what an owner signs to publish one, and the
 * rules every profile follows. Pure, no crypto: the relay verifies signatures in
 * profile-verify.ts. Kept identical in qrdx-explorer (lib/profiles/claim.ts),
 * which builds the message the wallet signs.
 *
 * A claim is a human-readable message, so the wallet shows the person what they
 * sign, followed by the same content as one line of JSON. The relay parses the
 * JSON, rebuilds the whole message from it and accepts only an exact match, so
 * the readable part can never say something the data does not.
 */

export type ProfileKind = 'account' | 'token'

export interface ProfileFields {
  /** Accounts only: tokens keep their on-chain name and symbol. */
  name?: string
  /** https URL of a PNG, JPEG, GIF, WebP or AVIF image. */
  image?: string
  description?: string
  website?: string
  /** Handles, without @ or URL. */
  x?: string
  telegram?: string
  github?: string
  /** An invite code (discord.gg/<code>). */
  discord?: string
}

export interface ProfileClaim {
  v: 1
  /** mainnet | testnet */
  network: string
  kind: ProfileKind
  /** The account (0xPQ… or 0x…) or the token (0x…) the profile describes. */
  subject: string
  /** Who signs: the account itself, or the token's creator. */
  signer: string
  /** null removes the profile. */
  profile: ProfileFields | null
  /** Unix seconds. A claim must be newer than the one it replaces. */
  issuedAt: number
}

export class ProfileError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

export const PQ_ADDRESS = /^0x[pP][qQ][0-9a-fA-F]{64}$/
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
export const NETWORK_NAME = /^[a-z][a-z0-9-]{0,31}$/
/** How far a claim's issuedAt may be from the relay's clock. */
export const MAX_AGE_SEC = 15 * 60
export const MAX_SKEW_SEC = 5 * 60

export const LIMITS = { name: 32, description: 280, url: 512 }
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']

export const isAddress = (a: string) => PQ_ADDRESS.test(a) || EVM_ADDRESS.test(a)
/** Profiles are keyed by lower-case address; 0xPQ checksums are display only. */
export const addressKey = (a: string) => a.toLowerCase()

// Characters that change how text renders around them (bidi overrides, zero-width
// joiners) or that a terminal or table would mangle.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff\uffa0]/g

function cleanText(v: unknown, field: string, max: number, multiline: boolean): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new ProfileError(`${field} must be text`)
  let s = v.normalize('NFC').replace(INVISIBLE, '')
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ')
  s = s.trim()
  if (!s) return undefined
  if ([...s].length > max) throw new ProfileError(`${field} is longer than ${max} characters`)
  return s
}

function hostIsPublic(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
  // IP literals: v4 dotted quads and anything bracketed (v6). Names only.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[')) return false
  return h.includes('.')
}

function cleanUrl(v: unknown, field: string, httpsOnly: boolean): string | undefined {
  const s = cleanText(v, field, LIMITS.url, false)
  if (!s) return undefined
  let u: URL
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`)
  } catch {
    throw new ProfileError(`${field} is not a valid web address`)
  }
  if (u.protocol !== 'https:' && (httpsOnly || u.protocol !== 'http:')) throw new ProfileError(`${field} must be an ${httpsOnly ? 'https' : 'http(s)'} address`)
  if (u.username || u.password) throw new ProfileError(`${field} must not contain a user name or password`)
  if (u.port && u.port !== '443' && u.port !== '80') throw new ProfileError(`${field} must use the standard port`)
  if (!hostIsPublic(u.hostname)) throw new ProfileError(`${field} must be on a public host name`)
  return u.toString()
}

/** A handle typed as @name, name, or a profile URL on one of `hosts`. */
function cleanHandle(v: unknown, field: string, hosts: string[], pattern: RegExp, hint: string): string | undefined {
  let s = cleanText(v, field, 128, false)
  if (!s) return undefined
  s = s.replace(/^@/, '')
  const m = new RegExp(`^(?:https?://)?(?:www\\.)?(?:${hosts.map((h) => h.replace(/\./g, '\\.')).join('|')})/(?:invite/)?([^/?#]+)/?(?:[?#].*)?$`, 'i').exec(s)
  if (m) s = m[1].replace(/^@/, '')
  if (!pattern.test(s)) throw new ProfileError(`${field}: ${hint}`)
  return s
}

/** Validate and normalise what an owner may publish. Throws ProfileError. */
export function normalizeProfile(kind: ProfileKind, input: unknown): ProfileFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProfileError('profile must be an object')
  const p = input as Record<string, unknown>
  const known = new Set(['name', 'image', 'description', 'website', 'x', 'telegram', 'github', 'discord'])
  for (const k of Object.keys(p)) if (!known.has(k)) throw new ProfileError(`unknown profile field "${k}"`)
  if (kind === 'token' && p.name !== undefined && p.name !== null && p.name !== '') {
    throw new ProfileError('a token keeps its on-chain name; set an image, a description and links')
  }
  const out: ProfileFields = {}
  const name = kind === 'account' ? cleanText(p.name, 'name', LIMITS.name, false) : undefined
  if (name !== undefined) {
    if (!/[\p{L}\p{N}]/u.test(name)) throw new ProfileError('name must contain a letter or a number')
    if (/^0x/i.test(name)) throw new ProfileError('name must not look like an address')
    out.name = name
  }
  const image = cleanUrl(p.image, 'image', true)
  if (image) out.image = image
  const description = cleanText(p.description, 'description', LIMITS.description, true)
  if (description) out.description = description
  const website = cleanUrl(p.website, 'website', false)
  if (website) out.website = website
  const x = cleanHandle(p.x, 'X', ['x.com', 'twitter.com'], /^[A-Za-z0-9_]{1,15}$/, 'a handle of up to 15 letters, numbers or _')
  if (x) out.x = x
  const telegram = cleanHandle(p.telegram, 'Telegram', ['t.me', 'telegram.me'], /^[A-Za-z][A-Za-z0-9_]{4,31}$/, 'a user name of 5–32 letters, numbers or _')
  if (telegram) out.telegram = telegram
  const github = cleanHandle(p.github, 'GitHub', ['github.com'], /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, 'a GitHub user or organisation name')
  if (github) out.github = github
  const discord = cleanHandle(p.discord, 'Discord', ['discord.gg', 'discord.com', 'discordapp.com'], /^[A-Za-z0-9-]{2,32}$/, 'an invite link (discord.gg/…) or its code')
  if (discord) out.discord = discord
  if (!Object.keys(out).length) throw new ProfileError('the profile is empty: to remove it, publish a removal instead')
  return out
}

/** Canonical field order, so the same profile always serialises the same way. */
function canonical(c: ProfileClaim): ProfileClaim {
  const p = c.profile
  const profile = p
    ? (Object.fromEntries(
        (['name', 'image', 'description', 'website', 'x', 'telegram', 'github', 'discord'] as const)
          .filter((k) => p[k] !== undefined)
          .map((k) => [k, p[k]])
      ) as ProfileFields)
    : null
  return { v: 1, network: c.network, kind: c.kind, subject: c.subject, signer: c.signer, profile, issuedAt: c.issuedAt }
}

const LABELS: [keyof ProfileFields, string][] = [
  ['name', 'Name'],
  ['image', 'Image'],
  ['description', 'Description'],
  ['website', 'Website'],
  ['x', 'X'],
  ['telegram', 'Telegram'],
  ['github', 'GitHub'],
  ['discord', 'Discord'],
]

/** The exact text the owner signs. */
export function profileMessage(claim: ProfileClaim): string {
  const c = canonical(claim)
  const what = c.kind === 'account' ? `account ${c.subject}` : `token ${c.subject}`
  const lines = [
    c.profile ? 'QRDX public profile' : 'QRDX public profile removal',
    '',
    c.profile
      ? `Publish this profile for ${c.kind === 'account' ? 'my' : 'the'} ${what} on QRDX ${c.network}. Anyone can see it. Signing sends no transaction and costs nothing.`
      : `Remove the public profile of ${c.kind === 'account' ? 'my' : 'the'} ${what} on QRDX ${c.network}. Signing sends no transaction and costs nothing.`,
    '',
    `${c.kind === 'account' ? 'Account' : 'Token'}: ${c.subject}`,
    ...(c.kind === 'token' ? [`Creator: ${c.signer}`] : []),
  ]
  if (c.profile) for (const [k, label] of LABELS) if (c.profile[k] !== undefined) lines.push(`${label}: ${String(c.profile[k]).replace(/\n/g, ' ')}`)
  lines.push(`Issued: ${new Date(c.issuedAt * 1000).toISOString()}`, '', JSON.stringify(c))
  return lines.join('\n')
}

/**
 * Read a signed message back into its claim. Throws unless the message is
 * exactly what profileMessage() produces for a well-formed claim.
 */
export function parseProfileMessage(message: string): ProfileClaim {
  if (typeof message !== 'string' || message.length > 8192) throw new ProfileError('message missing or too long')
  const json = message.slice(message.lastIndexOf('\n') + 1)
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(json)
  } catch {
    throw new ProfileError('message does not end with the profile data')
  }
  if (raw.v !== 1) throw new ProfileError('unsupported profile version')
  if (raw.kind !== 'account' && raw.kind !== 'token') throw new ProfileError('kind must be account or token')
  if (typeof raw.network !== 'string' || !NETWORK_NAME.test(raw.network)) throw new ProfileError('bad network')
  if (typeof raw.subject !== 'string' || typeof raw.signer !== 'string') throw new ProfileError('subject and signer are required')
  if (!Number.isInteger(raw.issuedAt)) throw new ProfileError('issuedAt must be a whole number of seconds')
  const kind = raw.kind
  if (kind === 'account' ? !isAddress(raw.subject) : !EVM_ADDRESS.test(raw.subject)) throw new ProfileError(`subject is not a${kind === 'token' ? ' token' : 'n'} address`)
  if (!isAddress(raw.signer)) throw new ProfileError('signer is not an address')
  if (kind === 'account' && addressKey(raw.subject) !== addressKey(raw.signer)) throw new ProfileError('an account profile is signed by the account itself')
  const claim: ProfileClaim = {
    v: 1,
    network: raw.network,
    kind,
    subject: raw.subject,
    signer: raw.signer,
    profile: raw.profile === null ? null : normalizeProfile(kind, raw.profile),
    issuedAt: raw.issuedAt as number,
  }
  if (profileMessage(claim) !== message) throw new ProfileError('the message does not match its data (or its fields are not in normal form)')
  return claim
}

/** A claim built in the browser: fields normalised, ready for profileMessage(). */
export function buildClaim(c: Omit<ProfileClaim, 'v' | 'profile' | 'issuedAt'> & { profile: unknown | null; issuedAt?: number }): ProfileClaim {
  return {
    v: 1,
    network: c.network,
    kind: c.kind,
    subject: c.subject,
    signer: c.signer,
    profile: c.profile === null ? null : normalizeProfile(c.kind, c.profile),
    issuedAt: c.issuedAt ?? Math.floor(Date.now() / 1000),
  }
}

/** What anyone reads back. `imageUrl` is the relay's image proxy (never the owner's host). */
export interface PublicProfile {
  kind: ProfileKind
  address: string
  signer: string
  profile: ProfileFields
  imageUrl: string | null
  issuedAt: number
  updatedAt: number
}

/** Where an owner's link points. */
export function socialLinks(p: ProfileFields): { kind: 'website' | 'x' | 'telegram' | 'github' | 'discord'; label: string; url: string }[] {
  const out: { kind: 'website' | 'x' | 'telegram' | 'github' | 'discord'; label: string; url: string }[] = []
  if (p.website) out.push({ kind: 'website', label: new URL(p.website).host.replace(/^www\./, ''), url: p.website })
  if (p.x) out.push({ kind: 'x', label: `@${p.x}`, url: `https://x.com/${p.x}` })
  if (p.telegram) out.push({ kind: 'telegram', label: `@${p.telegram}`, url: `https://t.me/${p.telegram}` })
  if (p.github) out.push({ kind: 'github', label: p.github, url: `https://github.com/${p.github}` })
  if (p.discord) out.push({ kind: 'discord', label: `discord.gg/${p.discord}`, url: `https://discord.gg/${p.discord}` })
  return out
}
