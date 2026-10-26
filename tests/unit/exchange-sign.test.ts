/** One-click trading signs in the browser: the bytes and keys must be the node's and the wallet's. */
import { describe, expect, it } from 'vitest'
import { keyFromSeed, signingBytes, txHash, OP_CODES } from '@/lib/exchange-sign'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'

describe('browser-signed exchange transactions', () => {
  it('derives the address the wallet derives from a seed', () => {
    // qrdx-wallet pqKeyPairFromSeed(0x77…77).address
    expect(keyFromSeed('7'.repeat(64)).address).toBe('0xPQ3077fDd885DC71Fb9F6d33Ede715D1E59de6510aF20310687424029d4f24b77d')
  })

  it('writes an agent-signed transaction as the node does', () => {
    const tx = {
      op_type: OP_CODES.PERP_CANCEL,
      chain_id: 7620,
      sender: '0xSUBA' + '12'.repeat(20),
      signer: '0xPQ' + 'ab'.repeat(32),
      nonce: 2,
      params: { market_id: 'BTC-USD-PERP', order_id: 'ab' },
      gas_limit: 100000,
      gas_price: '0',
    }
    // qrdx-node 321da74: ExchangeTransaction(..., signer=...).tx_hash()
    expect(txHash(tx)).toBe('e75436990e055090aebad98a032a59e3aa71510f1ac5f059f9dca8269d274578')
  })

  it('writes a batch as the node does, and signs verifiably', () => {
    const A = '0x' + '11'.repeat(20)
    const B = '0x' + '22'.repeat(20)
    const tx = {
      op_type: OP_CODES.BATCH,
      chain_id: 7620,
      sender: '0xPQ' + 'ab'.repeat(32),
      nonce: 3,
      params: { actions: [{ op: 'SWAP', params: { path: ['QRDX', A, B], amount_in: '1', min_amount_out: '2' } }, { op: 'CANCEL_ALL', params: { scope: 'perps' } }] },
      gas_limit: 2_010_000,
      gas_price: '0',
    }
    const bytes = signingBytes(tx)
    expect(Buffer.from(bytes).toString('hex').endsWith('7b2273636f7065223a20227065727073227d7d5d7d00000000001eab9030')).toBe(true)
    const key = keyFromSeed('7'.repeat(64))
    expect(ml_dsa65.verify(ml_dsa65.sign(bytes, key.secretKey), bytes, key.publicKey)).toBe(true)
  })
})
