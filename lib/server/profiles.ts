/**
 * Public profiles that token creators publish (relay/src/profiles-do.ts,
 * docs/PROFILES.md): an image, a description and links, each signed by the
 * token's creator and checked by the relay. Not verification: anyone can
 * create a token, and its creator says what they like about it.
 */

import type { ProfileFields, PublicProfile } from '../../relay/src/profile-claim'
import { cached } from './cache'
import type { Net } from './net'
import { relayGet } from './relay-service'

export interface TokenProfile {
  profile: ProfileFields
  /** The relay's copy of the image (never the creator's host), or null. */
  image: string | null
  signer: string
  updatedAt: number
}

export function profileImageUrl(net: Net, kind: 'account' | 'token', address: string, issuedAt: number): string {
  return `${net.cfg.profilesUrl}/v1/${net.cfg.id}/image/${kind}/${address.toLowerCase()}?v=${issuedAt}`
}

let warned = false

/** Every token profile on this network, by lower-case token address. Empty when the service is unreachable. */
export function tokenProfiles(net: Net): Promise<Map<string, TokenProfile>> {
  return cached(net.key('token-profiles'), 60_000, async () => {
    const body = await relayGet<{ profiles: Record<string, PublicProfile> }>(`${net.cfg.profilesUrl}/v1/${net.cfg.id}/tokens`, 'profiles')
    return new Map(
      Object.values(body.profiles).map((p) => [
        p.address.toLowerCase(),
        { profile: p.profile, image: p.profile.image ? profileImageUrl(net, 'token', p.address, p.issuedAt) : null, signer: p.signer, updatedAt: p.updatedAt },
      ])
    )
  }).catch((e) => {
    if (!warned) console.warn(`[profiles] ${(e as Error).message}`)
    warned = true
    return new Map<string, TokenProfile>()
  })
}
