/**
 * URL segment → asset. See docs/ARCHITECTURE.md §2.
 *
 *   verified slug        → the registry asset (its token, if this network has one)
 *   token address        → 308 to the slug if it is a verified asset's token,
 *                          else the unverified token from the node
 *   anything else        → not found; symbols never resolve to unverified tokens,
 *                          because anyone can deploy a token under any symbol
 */

import {
  AssetRef,
  NATIVE_QRDX,
  VERIFIED_ASSETS,
  assetId,
  VerifiedAsset,
  addressColor,
  isTokenAddress,
  shortAddress,
  verifiedBySlug,
} from '../assets'
import type { ServerConfig } from '../config'
import { cached } from './cache'
import { ApiError, Redirect } from './http'
import type { Net } from './net'
import type { NodeToken } from './node'
import { TokenProfile, tokenProfiles } from './profiles'

export interface TokenIndex {
  byAddress: Map<string, NodeToken>
  /** slug → token for verified assets listed on this network (native QRDX: "QRDX"). */
  verified: Map<string, NodeToken | { token_address: string; pinnedOnly: true } | { token_address: string; native: true }>
  /** lower-case token address → slug */
  slugByAddress: Map<string, string>
  /** false when the node could not be read; verified assets then have no address. */
  nodeOk: boolean
  /** Profiles token creators published, by lower-case address. */
  profiles: Map<string, TokenProfile>
}

function buildIndex(tokens: NodeToken[], cfg: ServerConfig, profiles: Map<string, TokenProfile>): TokenIndex {
  const byAddress = new Map(tokens.map((t) => [t.token_address.toLowerCase(), t]))
  const issuers = new Set(cfg.verifiedIssuers.map((a) => a.toLowerCase()))
  // A local dev chain has no issuers to trust; match by symbol there and only there.
  const symbolOnly = cfg.id === 'local' && issuers.size === 0

  const verified: TokenIndex['verified'] = new Map()
  const slugByAddress = new Map<string, string>()
  for (const asset of VERIFIED_ASSETS) {
    if (asset.native) {
      verified.set(asset.slug, { token_address: NATIVE_QRDX, native: true })
      slugByAddress.set(NATIVE_QRDX.toLowerCase(), asset.slug)
      continue
    }
    const pinned = cfg.pinnedAssets[asset.slug] ?? asset.addresses?.[cfg.id]?.toLowerCase()
    if (pinned) {
      verified.set(asset.slug, byAddress.get(pinned) ?? { token_address: pinned, pinnedOnly: true })
      slugByAddress.set(pinned, asset.slug)
      continue
    }
    const matches = tokens
      .filter(
        (t) =>
          t.symbol.toLowerCase() === asset.onChainSymbol.toLowerCase() &&
          (symbolOnly || issuers.has(t.creator.toLowerCase()))
      )
      .sort((a, b) => a.created_height - b.created_height)
    if (matches[0]) {
      verified.set(asset.slug, matches[0])
      slugByAddress.set(matches[0].token_address.toLowerCase(), asset.slug)
    }
  }
  return { byAddress, verified, slugByAddress, nodeOk: true, profiles }
}

const EMPTY: TokenIndex = { byAddress: new Map(), verified: new Map(), slugByAddress: new Map(), nodeOk: false, profiles: new Map() }

/** The node's tokens, indexed. Never throws: a down node yields an empty index with nodeOk=false. */
export function tokenIndex(net: Net): Promise<TokenIndex> {
  return cached(net.key('token-index'), 5_000, async () => {
    try {
      const [tokens, profiles] = await Promise.all([net.node.tokens(), tokenProfiles(net)])
      return buildIndex(tokens, net.cfg, profiles)
    } catch (err) {
      console.warn(`[resolve] token list unavailable: ${(err as Error).message}`)
      return EMPTY
    }
  })
}

export function verifiedRef(asset: VerifiedAsset, idx: TokenIndex): AssetRef {
  const token = idx.verified.get(asset.slug)
  return {
    segment: asset.slug,
    slug: asset.slug,
    symbol: asset.symbol,
    name: asset.name,
    verified: true,
    address: token ? assetId(token.token_address) : null,
    onChainSymbol: token && 'symbol' in token ? token.symbol : asset.onChainSymbol,
    decimals: token && 'decimals' in token ? token.decimals : asset.decimals,
    color: asset.color,
    quoteRank: asset.quoteRank,
    usdStable: !!asset.usdStable,
    image: null,
  }
}

export function unverifiedRef(address: string, token: NodeToken | undefined, profile?: TokenProfile): AssetRef {
  const a = address.toLowerCase()
  return {
    segment: a,
    slug: null,
    symbol: token?.symbol || shortAddress(a),
    name: token?.name || 'Unknown token',
    verified: false,
    address: a,
    onChainSymbol: token?.symbol ?? null,
    decimals: token?.decimals ?? 18,
    color: addressColor(a),
    quoteRank: 0,
    usdStable: false,
    image: profile?.image ?? null,
  }
}

/** Any token address → its ref (verified when it is a verified asset's token). */
export function refForAddress(address: string, idx: TokenIndex): AssetRef {
  const a = address.toLowerCase()
  const slug = idx.slugByAddress.get(a)
  const asset = slug ? verifiedBySlug(slug) : undefined
  return asset ? verifiedRef(asset, idx) : unverifiedRef(a, idx.byAddress.get(a), idx.profiles.get(a))
}

/** Resolve one URL segment. Throws Redirect for a verified token's address, ApiError otherwise. */
export async function resolveSegment(
  net: Net,
  segment: string
): Promise<{ ref: AssetRef; asset?: VerifiedAsset; token?: NodeToken }> {
  const idx = await tokenIndex(net)
  const asset = verifiedBySlug(segment)
  if (asset) {
    const t = idx.verified.get(asset.slug)
    return { ref: verifiedRef(asset, idx), asset, token: t && 'symbol' in t ? t : undefined }
  }
  if (isTokenAddress(segment)) {
    const a = segment.toLowerCase()
    const slug = idx.slugByAddress.get(a)
    if (slug) throw new Redirect(segment, slug)
    let token = idx.byAddress.get(a)
    if (!token) {
      // Newer than the cached list, or the list failed: ask for this one token.
      token = (await net.node.token(a)) ?? undefined
      if (!token) throw new ApiError('not_found', `No token at ${a} on this network`)
    }
    return { ref: unverifiedRef(a, token, idx.profiles.get(a)), token }
  }
  const candidates = [...idx.byAddress.values()]
    .filter((t) => t.symbol.toLowerCase() === segment.toLowerCase())
    .map((t) => ({ address: t.token_address.toLowerCase(), symbol: t.symbol, name: t.name, creator: t.creator }))
  if (candidates.length) {
    throw new ApiError(
      'ambiguous_symbol',
      `"${segment}" is not a verified asset. Unverified tokens trade by address.`,
      { candidates }
    )
  }
  throw new ApiError('not_found', `Unknown asset "${segment}"`)
}
