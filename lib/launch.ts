/**
 * Coin launches on the native exchange: a new token, its pool, and a one-sided
 * "launch curve" — all of the curve's tokens deposited in a price range that
 * starts at the launch price and ends `multiple` times higher. Buyers swap the
 * quote asset in and walk the price up the range, which is how a bonding curve
 * behaves, but on an ordinary concentrated-liquidity pool (qrdx-node
 * exchange/amm.py) that anyone can also add to, trade on, or route through.
 *
 * Pure: shared by the launch form and its tests.
 */

import { blake2b } from '@noble/hashes/blake2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { dec, div, str } from './decimal'

/**
 * The address TOKEN_DEPLOY gives a token: blake2b-160 of "sender:nonce:symbol"
 * (qrdx-node ExchangeStateManager.derive_token_address). `sender` must be the
 * 0xPQ address exactly as the wallet signs it, and `nonce` the exchange nonce
 * the deploy was signed with.
 */
export function deriveTokenAddress(sender: string, nonce: number, symbol: string): string {
  return '0x' + bytesToHex(blake2b(utf8ToBytes(`${sender}:${nonce}:${symbol}`), { dkLen: 20 }))
}

/** Fee tiers (hundredths of a basis point) and their tick spacing (amm.py _TICK_SPACINGS). */
export const FEE_TIERS = [
  { tier: 100, rate: '0.01%', spacing: 1 },
  { tier: 500, rate: '0.05%', spacing: 10 },
  { tier: 3000, rate: '0.3%', spacing: 60 },
  { tier: 10000, rate: '1%', spacing: 200 },
] as const
export type FeeTier = (typeof FEE_TIERS)[number]['tier']
export const tickSpacing = (tier: number) => FEE_TIERS.find((f) => f.tier === tier)?.spacing ?? 60

/** Pool types and what creating one costs in QRDX (amm.py POOL_STAKE_REQUIREMENTS). */
export const POOL_TYPES = [
  {
    type: 'SUBSIDIZED',
    qrdx: '5000',
    label: 'Burn 5,000 QRDX',
    detail: 'Burned for good. The pool is permanent and community-owned: the strongest signal to buyers.',
  },
  {
    type: 'STANDARD',
    qrdx: '10000',
    label: 'Stake 10,000 QRDX',
    detail: 'Refunded if you remove the pool, which is only possible once every position in it is withdrawn.',
  },
] as const
export type PoolType = (typeof POOL_TYPES)[number]['type']

const MIN_TICK = -887272
const MAX_TICK = 887272
const LOG_BASE = Math.log(1.0001)
const tickOf = (price: number) => Math.log(price) / LOG_BASE

export interface LaunchCurve {
  /** The new token sorts first (lower address) and is the pool's token0. */
  tokenIsToken0: boolean
  token0: string
  token1: string
  /** CREATE_POOL `initial_price`: token1 per token0, of the sorted pair. */
  initialPrice: string
  tickLower: number
  tickUpper: number
  /** Which ADD_LIQUIDITY amount the curve deposit is quoted with. */
  depositSide: 'amount0' | 'amount1'
  /** Quote per token where buying starts and where the curve runs out, after rounding to ticks. */
  startPrice: number
  endPrice: number
}

/**
 * Place a one-sided curve for `token` against `quote`.
 *
 * The pool opens just outside the range, so the deposit is the token alone:
 *  - token is token0: price (quote per token) rises as people buy, so the range
 *    sits above the opening price and the pool opens half a tick below it;
 *  - token is token1: the pool's price is token per quote and falls as people
 *    buy, so the range sits below and the pool opens half a tick above it.
 * Ticks are multiples of the fee tier's spacing, as the node requires.
 */
export function launchCurve(opts: {
  token: string
  quote: string
  /** Quote per token at the start of the curve. */
  startPrice: number
  /** End of the curve as a multiple of the start (e.g. 100). */
  multiple: number
  spacing: number
}): LaunchCurve {
  const { token, quote, startPrice, multiple, spacing } = opts
  if (!(startPrice > 0) || !Number.isFinite(startPrice)) throw new Error('The start price must be positive.')
  if (!(multiple > 1)) throw new Error('The curve must end above where it starts.')
  const t = token.toLowerCase()
  const q = quote.toLowerCase()
  const tokenIsToken0 = t < q
  const [token0, token1] = tokenIsToken0 ? [t, q] : [q, t]
  let tickLower: number
  let tickUpper: number
  let openTick: number
  if (tokenIsToken0) {
    tickLower = Math.ceil(tickOf(startPrice) / spacing) * spacing
    tickUpper = Math.floor(tickOf(startPrice * multiple) / spacing) * spacing
    openTick = tickLower - 0.5
  } else {
    tickUpper = Math.floor(tickOf(1 / startPrice) / spacing) * spacing
    tickLower = Math.ceil(tickOf(1 / (startPrice * multiple)) / spacing) * spacing
    openTick = tickUpper + 0.5
  }
  if (tickUpper <= tickLower) throw new Error('The curve is too short for this fee tier: raise the end multiple.')
  if (tickLower < MIN_TICK || tickUpper > MAX_TICK) throw new Error('That price is outside what the pool can represent.')
  const open = Math.pow(1.0001, openTick)
  const initialPrice = decimalString(open)
  if (dec(initialPrice) === 0n) throw new Error('The start price is too small to represent (below 1e-18).')
  const p = (tick: number) => Math.pow(1.0001, tick)
  return {
    tokenIsToken0,
    token0,
    token1,
    initialPrice,
    tickLower,
    tickUpper,
    depositSide: tokenIsToken0 ? 'amount0' : 'amount1',
    startPrice: tokenIsToken0 ? p(tickLower) : 1 / p(tickUpper),
    endPrice: tokenIsToken0 ? p(tickUpper) : 1 / p(tickLower),
  }
}

/** A float as a plain decimal string with 15 significant digits (no exponent). */
export function decimalString(x: number): string {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`Not a positive number: ${x}`)
  return str(dec(x.toPrecision(15)))
}

/** Canonical CREATE_POOL price from "B per A" as the user typed it. */
export function canonicalInitialPrice(tokenA: string, tokenB: string, bPerA: string): string {
  const a = tokenA.toLowerCase()
  const b = tokenB.toLowerCase()
  // Sorted pair: token1 per token0. If A sorts first it is token0 and the price is as typed.
  return a < b ? bPerA : str(div(dec('1'), dec(bPerA)))
}

export interface LaunchSpec {
  name: string
  symbol: string
  /** Initial supply, all of it to the creator at deploy. */
  supply: string
  /** Of the initial supply, how much the creator keeps; the rest goes on the launch curve. */
  keep: string
  /** No market yet: the whole supply stays with the creator. */
  tokenOnly: boolean
  /** Who may mint more later; null for a fixed supply. */
  mintAuthority: string | null
  /** Cap on total supply when mintable; "" for none. */
  maxSupply: string
  /** Token standard extensions (none: a plain token). */
  extensions?: TokenExtensions
  /** The creator's address, for extension authorities that default to it. */
  creator?: string | null
}

const DECIMAL = /^\d+(\.\d+)?$/
export const isAuthorityAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a) || /^0xPQ[0-9a-fA-F]{64}$/.test(a)

/** Field-level problems with a launch, or null. Mirrors qrdx-node tokens.py deploy rules. */
export function validateLaunch(s: LaunchSpec): string | null {
  const name = s.name.trim()
  const symbol = s.symbol.trim()
  if (name.length < 1 || name.length > 64) return 'The name must be 1–64 characters.'
  if (symbol.length < 1 || symbol.length > 16) return 'The ticker must be 1–16 characters.'
  if (/[\s:]/.test(symbol) || /[^\x21-\x7e]/.test(symbol)) return 'The ticker cannot contain spaces, ":" or unusual characters.'
  if (!DECIMAL.test(s.supply)) return 'Enter a supply.'
  if (s.mintAuthority !== null && !isAuthorityAddress(s.mintAuthority)) return 'The mint authority must be a 0x… or 0xPQ… address.'
  if (dec(s.supply) <= 0n && s.mintAuthority === null) return 'A token with no initial supply needs a mint authority.'
  if (s.maxSupply) {
    if (s.mintAuthority === null) return 'A supply cap only matters for a mintable token.'
    if (!DECIMAL.test(s.maxSupply) || dec(s.maxSupply) <= 0n) return 'Enter a valid max supply, or leave it empty.'
    if (dec(s.maxSupply) < dec(s.supply)) return 'The max supply cannot be below the initial supply.'
  }
  if (s.extensions) {
    const bad = validateExtensions(s.extensions)
    if (bad) return bad
    if (!s.tokenOnly && untradableReason(s.extensions)) return untradableReason(s.extensions)
  }
  if (!s.tokenOnly) {
    if (dec(s.supply) <= 0n) return 'A market needs an initial supply to put on the curve.'
    if (!DECIMAL.test(s.keep || '0')) return 'Enter how much to keep (0 for none).'
    if (dec(s.keep || '0') >= dec(s.supply)) return 'Keep less than the whole supply: the rest goes on the curve.'
  }
  return null
}

/** TOKEN_DEPLOY params for a spec. */
export function deployParams(s: LaunchSpec): Record<string, unknown> {
  return {
    name: s.name.trim(),
    symbol: s.symbol.trim(),
    decimals: s.extensions?.decimals ?? 18,
    initial_supply: s.supply,
    ...(s.mintAuthority ? { mint_authority: s.mintAuthority } : {}),
    ...(s.mintAuthority && s.maxSupply ? { max_supply: s.maxSupply } : {}),
    ...(s.extensions ? extensionParams(s.extensions, s.creator ?? null) : {}),
  }
}

// ── Token standard extensions (qrdx-node docs/NATIVE_TOKENS.md §7, exchange/tokens.py) ──

/**
 * What a token opts into when it is created; nothing can be added later. Each authority is
 * the creator unless handed to another address, and can be renounced later.
 */
export interface TokenExtensions {
  /** How wallets display it (0–18); the ledger counts 1e-18 for every token. */
  decimals: number
  /** Metadata: a uri (≤ 256) and up to 16 key/value fields, editable by the metadata authority. */
  uri: string
  fields: { key: string; value: string }[]
  /** Who may edit the metadata later: the creator, or nobody (immutable). */
  metadataEditable: boolean
  /** Who may freeze and thaw holders' balances. */
  freeze: 'none' | 'self' | 'other'
  freezeOther: string
  /** Every account starts frozen until the freeze authority thaws it (KYC'd assets). */
  defaultFrozen: boolean
  /** Basis points withheld from every holder-to-holder transfer ("" = no fee). */
  transferFeeBps: string
  /** Cap on the fee per transfer, in tokens ("" = no cap). */
  maxTransferFee: string
  /** Soulbound: minted and burned, never moved between holders. */
  nonTransferable: boolean
  /** May move and burn anyone's balance without an allowance (a regulated issuer's clawback). */
  permanentDelegate: string
  /** The creator can stop every transfer, mint and burn, and resume them. */
  pausable: boolean
  /** ERC-777 default operators (≤ 8): operators for every holder until that holder revokes one. */
  defaultOperators: string
  /** Advisory (whitepaper §9.2): backed by locked classical assets, tradable after Doomsday. */
  postDoomsdayTrade: boolean
}

export const PLAIN_TOKEN: TokenExtensions = {
  decimals: 18,
  uri: '',
  fields: [],
  metadataEditable: true,
  freeze: 'none',
  freezeOther: '',
  defaultFrozen: false,
  transferFeeBps: '',
  maxTransferFee: '',
  nonTransferable: false,
  permanentDelegate: '',
  pausable: false,
  defaultOperators: '',
  postDoomsdayTrade: false,
}

const printable = (s: string) => /^[\x20-\x7e -￿]*$/.test(s)
const operatorsOf = (s: string) => s.split(/[\s,]+/).map((a) => a.trim()).filter(Boolean)

export function freezeAuthorityOf(e: TokenExtensions, creator: string | null): string | null {
  return e.freeze === 'self' ? creator : e.freeze === 'other' ? e.freezeOther.trim() : null
}

/** Why a token with these extensions cannot have a pool or a book, or null when it can. */
export function untradableReason(e: TokenExtensions): string | null {
  if (e.nonTransferable) return 'A soulbound token cannot move, so it cannot be pooled or traded.'
  if (e.transferFeeBps.trim() !== '') return 'A token with a transfer fee cannot be pooled or traded: a fee withheld on the way into a pool would break its accounting.'
  if (e.defaultFrozen) return 'In a default-frozen token every account, a pool included, starts frozen until the freeze authority thaws it.'
  return null
}

/** The first problem with the extensions, or null. Mirrors qrdx-node tokens.py _apply_extensions. */
export function validateExtensions(e: TokenExtensions): string | null {
  if (!Number.isInteger(e.decimals) || e.decimals < 0 || e.decimals > 18) return 'Decimals must be 0–18.'
  if (e.uri.length > 256 || !printable(e.uri)) return 'The metadata URI must be at most 256 printable characters.'
  const named = e.fields.filter((f) => f.key.trim() || f.value)
  if (named.length > 16) return 'At most 16 metadata fields.'
  for (const f of named) {
    const k = f.key.trim()
    if (k.length < 1 || k.length > 32 || !printable(k)) return 'Metadata field names must be 1–32 printable characters.'
    if (f.value.length > 256 || !printable(f.value)) return `The "${k}" field must be at most 256 printable characters.`
  }
  if (new Set(named.map((f) => f.key.trim())).size !== named.length) return 'Metadata field names must be different.'
  if (e.freeze === 'other' && !isAuthorityAddress(e.freezeOther.trim())) return 'The freeze authority must be a 0x… or 0xPQ… address.'
  if (e.defaultFrozen && e.freeze === 'none') return 'A default-frozen token needs a freeze authority to thaw accounts.'
  if (e.transferFeeBps.trim() !== '') {
    if (!/^\d+$/.test(e.transferFeeBps.trim()) || Number(e.transferFeeBps) > 10_000) return 'The transfer fee is 0–10,000 basis points (100 = 1 %).'
    if (e.maxTransferFee && !DECIMAL.test(e.maxTransferFee)) return 'Enter a valid maximum fee, or leave it empty.'
    if (e.nonTransferable) return 'A non-transferable token cannot charge a transfer fee.'
  }
  if (e.permanentDelegate.trim() && !isAuthorityAddress(e.permanentDelegate.trim())) return 'The permanent delegate must be a 0x… or 0xPQ… address.'
  const ops = operatorsOf(e.defaultOperators)
  if (ops.length > 8) return 'At most 8 default operators.'
  if (ops.some((o) => !isAuthorityAddress(o))) return 'Default operators must be 0x… or 0xPQ… addresses.'
  return null
}

/** The TOKEN_DEPLOY parameters the extensions add. A plain token adds none, so it is committed as before. */
export function extensionParams(e: TokenExtensions, creator: string | null): Record<string, string | number | boolean | string[] | Record<string, string>> {
  const out: Record<string, string | number | boolean | string[] | Record<string, string>> = {}
  const freeze = freezeAuthorityOf(e, creator)
  if (freeze) out.freeze_authority = freeze
  const fields = Object.fromEntries(e.fields.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value]))
  if (e.uri.trim() || Object.keys(fields).length || !e.metadataEditable) {
    out.uri = e.uri.trim()
    if (Object.keys(fields).length) out.metadata = fields
    if (!e.metadataEditable) out.metadata_authority = ''
  }
  if (e.transferFeeBps.trim() !== '') {
    out.transfer_fee_bps = Number(e.transferFeeBps)
    if (e.maxTransferFee.trim()) out.max_transfer_fee = e.maxTransferFee.trim()
  }
  if (e.nonTransferable) out.non_transferable = true
  if (e.defaultFrozen) out.default_frozen = true
  if (e.permanentDelegate.trim()) out.permanent_delegate = e.permanentDelegate.trim()
  if (e.pausable) out.pausable = true
  const ops = operatorsOf(e.defaultOperators)
  if (ops.length) out.default_operators = ops
  if (e.postDoomsdayTrade) out.post_doomsday_trade = true
  return out
}

/** Plain-language lines on what the extensions let someone do, for the form and the review. */
export function extensionSummary(e: TokenExtensions, creator: string | null): string[] {
  const lines: string[] = []
  const who = (a: string | null) => (a && creator && a.toLowerCase() === creator.toLowerCase() ? 'you' : a ? `${a.slice(0, 10)}…` : 'nobody')
  const freeze = freezeAuthorityOf(e, creator)
  if (freeze) lines.push(`${who(freeze)} can freeze any holder's balance${e.defaultFrozen ? ', and every account starts frozen until thawed' : ''}`)
  if (e.transferFeeBps.trim() !== '') lines.push(`${(Number(e.transferFeeBps) / 100).toFixed(2)} % of every transfer is withheld for the fee authority (you)${e.maxTransferFee ? `, at most ${e.maxTransferFee} a transfer` : ''}`)
  if (e.nonTransferable) lines.push('holders can never move it (soulbound)')
  if (e.permanentDelegate.trim()) lines.push(`${who(e.permanentDelegate.trim())} can move or burn anyone's balance without permission`)
  if (e.pausable) lines.push('you can pause every transfer, mint and burn')
  if (operatorsOf(e.defaultOperators).length) lines.push(`${operatorsOf(e.defaultOperators).length} default operator(s) can move every holder's balance until that holder revokes them`)
  if (e.uri.trim() || e.fields.some((f) => f.key.trim())) lines.push(e.metadataEditable ? 'you can edit its metadata later' : 'its metadata is fixed forever')
  return lines
}
