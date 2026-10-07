/**
 * The two networks one deployment serves, and where their nodes are.
 *
 * trade.qrdx.org serves mainnet and testnet side by side. Each is a "slot" with
 * its own API prefix; the pages follow the wallet's network (a wallet on QRDX
 * Testnet sees testnet markets) and fall back to the visitor's choice.
 *
 *   slot   API prefix        network (default)
 *   main   /api/v1           mainnet  — NEXT_PUBLIC_QRDX_MAIN_NETWORK
 *   test   /api/v1-test      testnet  — NEXT_PUBLIC_QRDX_TEST_NETWORK
 *
 * Point the test slot at a local node for development:
 * NEXT_PUBLIC_QRDX_TEST_NETWORK=local.
 *
 * Server-only overrides, per slot (MAIN or TEST):
 *   QRDX_{SLOT}_RPC_URL             node JSON-RPC endpoint (…/rpc)
 *   QRDX_{SLOT}_NODE_URL            node REST base (/get_blocks, /get_status)
 *   QRDX_{SLOT}_VERIFIED_ISSUERS    comma-separated creator addresses whose tokens can be verified
 *   QRDX_{SLOT}_ASSET_ADDRESSES     JSON {"btc": "0x…"} pinning verified assets to token addresses
 *   QRDX_{SLOT}_INDEX_BLOCKS        1 to build the spot trade tape from /get_blocks (only nodes
 *                                   without the per-IP query-cost limit; on by default for local)
 *   QRDX_HISTORY_URL                market history service (relay/, default trade.qrdx.org/api/history)
 *
 * Chain IDs and URLs mirror qrdx-wallet/src/core/chains.ts, so the site and the
 * wallet agree on what each network is.
 */

export type NetworkId = 'mainnet' | 'testnet' | 'local'
export type Slot = 'main' | 'test'
export const SLOTS: Slot[] = ['main', 'test']

export interface NetworkConfig {
  id: NetworkId
  name: string
  chainId: number
  rpcUrl: string
  nodeUrl: string
  explorerUrl: string
  /** Target block interval (qrdx/constants.py BLOCK_TIME). */
  blockTimeSec: number
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: 'mainnet',
    name: 'QRDX Mainnet',
    chainId: 1337,
    rpcUrl: 'https://rpc.qrdx.org',
    nodeUrl: 'https://node.qrdx.org',
    explorerUrl: 'https://explorer.qrdx.org',
    blockTimeSec: 180,
  },
  testnet: {
    id: 'testnet',
    name: 'QRDX Testnet',
    chainId: 31337,
    rpcUrl: 'https://test.qrdx.org/rpc',
    nodeUrl: 'https://test.qrdx.org',
    explorerUrl: 'https://explorer.qrdx.org',
    blockTimeSec: 180,
  },
  local: {
    id: 'local',
    name: 'QRDX Local',
    chainId: 9999,
    rpcUrl: 'http://127.0.0.1:3007/rpc',
    nodeUrl: 'http://127.0.0.1:3007',
    explorerUrl: 'http://127.0.0.1:3000',
    blockTimeSec: 180,
  },
}

const API_VERSION: Record<Slot, string> = { main: 'v1', test: 'v1-test' }

const asNetwork = (raw: string | undefined, fallback: NetworkId): NetworkId =>
  raw && raw.toLowerCase() in NETWORKS ? (raw.toLowerCase() as NetworkId) : fallback

/** The network a slot serves. (NEXT_PUBLIC_ variables are inlined, so this works in the browser.) */
export function slotNetwork(slot: Slot): NetworkConfig {
  return slot === 'main'
    ? NETWORKS[asNetwork(process.env.NEXT_PUBLIC_QRDX_MAIN_NETWORK, 'mainnet')]
    : NETWORKS[asNetwork(process.env.NEXT_PUBLIC_QRDX_TEST_NETWORK, 'testnet')]
}

export const apiBase = (slot: Slot) => `/api/${API_VERSION[slot]}`

/**
 * A page of the network's block explorer: an address (accounts and tokens alike) or
 * a transaction. The explorer serves every network; `?network=` picks this one.
 */
export function explorerLink(network: NetworkConfig, kind: 'address' | 'tx', id: string): string {
  return `${network.explorerUrl}/${kind}/${id}?network=${network.id}`
}

export function slotFromVersion(version: string): Slot | null {
  return (Object.keys(API_VERSION) as Slot[]).find((s) => API_VERSION[s] === version) ?? null
}

/** Which slot a wallet chain ID belongs to, if either. */
export function slotForChainId(chainId: number | null | undefined): Slot | null {
  return SLOTS.find((s) => slotNetwork(s).chainId === chainId) ?? null
}

export interface ServerConfig extends NetworkConfig {
  slot: Slot
  verifiedIssuers: string[]
  pinnedAssets: Record<string, string>
  /** Read blocks to index spot swaps (the trade tape). Public nodes cost-limit block reads. */
  indexBlocks: boolean
  /** Market history service base URL (…/api/history). */
  historyUrl: string
  /** Public profiles service base URL (…/api/profiles). */
  profilesUrl: string
}

/** A slot's network with its server-side overrides. Call only from route handlers / lib/server. */
export function serverConfig(slot: Slot): ServerConfig {
  const base = slotNetwork(slot)
  const env = (name: string) => process.env[`QRDX_${slot.toUpperCase()}_${name}`]
  let pinned: Record<string, string> = {}
  try {
    const raw = env('ASSET_ADDRESSES')
    if (raw) pinned = JSON.parse(raw)
  } catch {
    console.warn(`QRDX_${slot.toUpperCase()}_ASSET_ADDRESSES is not valid JSON; ignoring it`)
  }
  return {
    ...base,
    slot,
    rpcUrl: env('RPC_URL') || base.rpcUrl,
    nodeUrl: (env('NODE_URL') || base.nodeUrl).replace(/\/$/, ''),
    verifiedIssuers: (env('VERIFIED_ISSUERS') || '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    pinnedAssets: Object.fromEntries(
      Object.entries(pinned).map(([slug, addr]) => [slug.toLowerCase(), String(addr).toLowerCase()])
    ),
    indexBlocks: env('INDEX_BLOCKS') ? env('INDEX_BLOCKS') === '1' : base.id === 'local',
    historyUrl: (process.env.QRDX_HISTORY_URL || 'https://trade.qrdx.org/api/history').replace(/\/$/, ''),
    profilesUrl: (process.env.QRDX_PROFILES_URL || 'https://trade.qrdx.org/api/profiles').replace(/\/$/, ''),
  }
}
