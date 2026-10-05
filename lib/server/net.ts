/**
 * One network's server context: its config, its node client, and a cache
 * namespace. Every lib/server function takes one, so mainnet and testnet are
 * served side by side without sharing caches or indexer state.
 */

import { ServerConfig, Slot, serverConfig, slotFromVersion } from '../config'
import { ApiError } from './http'
import { NodeClient, createNodeClient } from './node'

export interface Net {
  slot: Slot
  cfg: ServerConfig
  node: NodeClient
  /** Cache key in this network's namespace. */
  key: (k: string) => string
}

const nets = new Map<Slot, Net>()

export function getNet(slot: Slot): Net {
  let n = nets.get(slot)
  if (!n) {
    const cfg = serverConfig(slot)
    n = { slot, cfg, node: createNodeClient(cfg), key: (k) => `${slot}:${k}` }
    nets.set(slot, n)
  }
  return n
}

/** `v1` → mainnet slot, `v1-test` → testnet slot; anything else is a 404. */
export function netFromVersion(version: string): Net {
  const slot = slotFromVersion(version)
  if (!slot) throw new ApiError('not_found', `Unknown API version "${version}" (use v1 or v1-test)`)
  return getNet(slot)
}
