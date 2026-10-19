import { describe, expect, it } from 'vitest'
import { bytesLiteralHex, revertReason } from '@/lib/nft-client'

describe('revert reasons from the node', () => {
  it('reads revert data the node prints as a Python bytes literal', () => {
    // What test.qrdx.org answered for buy() without the QRDX: WrongPayment() = 0x788a686f.
    expect(bytesLiteralHex("Call failed: b'x\\x8aho'")).toBe('0x788a686f')
    expect(revertReason({ message: "Call failed: b'x\\x8aho'" })).toMatch(/payment does not match/)
    expect(revertReason({ message: "Call failed: b'\\xc1\\x9f\\x17\\xa9'" })).toMatch(/not approved/)
  })
  it('keeps hex revert data and plain messages working', () => {
    expect(revertReason({ message: 'execution reverted', data: '0x665c1c57' })).toMatch(/not listed/)
    expect(revertReason({ message: 'execution reverted: paused' })).toBe('paused')
  })
})
