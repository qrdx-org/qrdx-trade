/**
 * Compile contracts/QRDXNFTMarket.sol into lib/nft-market/artifact.json (ABI and bytecode).
 *
 *   pnpm nft-market:compile
 *
 * Shanghai, because the node's EVM is a ShanghaiVM (qrdx-node qrdx/contracts/evm_executor_v2.py).
 * The optimizer keeps the deployment well inside a block's 1,000,000 gas.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const solc = createRequire(import.meta.url)('solc')
const source = readFileSync(join(root, 'contracts', 'QRDXNFTMarket.sol'), 'utf8')
const input = {
  language: 'Solidity',
  sources: { 'QRDXNFTMarket.sol': { content: source } },
  settings: {
    evmVersion: 'shanghai',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { QRDXNFTMarket: ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
}
const out = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (out.errors ?? []).filter((e) => e.severity === 'error')
for (const e of out.errors ?? []) console.error(e.formattedMessage)
if (errors.length) process.exit(1)
const c = out.contracts['QRDXNFTMarket.sol'].QRDXNFTMarket
const artifact = {
  contract: 'QRDXNFTMarket',
  compiler: solc.version(),
  evmVersion: 'shanghai',
  abi: c.abi,
  bytecode: '0x' + c.evm.bytecode.object,
  deployedBytecode: '0x' + c.evm.deployedBytecode.object,
}
mkdirSync(join(root, 'lib', 'nft-market'), { recursive: true })
writeFileSync(join(root, 'lib', 'nft-market', 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n')
console.log(`QRDXNFTMarket: ${(c.evm.bytecode.object.length / 2).toLocaleString()} bytes to deploy, ${(c.evm.deployedBytecode.object.length / 2).toLocaleString()} at runtime (${solc.version()})`)
