/**
 * Public profiles (relay/src/profile-*.ts, docs/PROFILES.md): what an owner may
 * publish, the exact text they sign, and the signatures that prove it. The
 * relay is the only gate between a stranger and someone else's profile, so it
 * is pinned.
 */
import { describe, expect, it } from 'vitest'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { ProfileError, buildClaim, normalizeProfile, parseProfileMessage, profileMessage, socialLinks } from '../../relay/src/profile-claim'
import { eip191Hash, evmAddressOf, pqAddressOf, pqPrefixed, verifySigner } from '../../relay/src/profile-verify'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

function pqAccount(seedByte = 7) {
  const keys = ml_dsa65.keygen(new Uint8Array(32).fill(seedByte))
  const lower = pqAddressOf(keys.publicKey)
  // The checksummed form the wallet shows; the relay compares case-insensitively.
  const address = '0xPQ' + lower.slice(4).toUpperCase()
  return { keys, address, sign: (m: string) => hex(ml_dsa65.sign(pqPrefixed(m), keys.secretKey)), publicKey: hex(keys.publicKey) }
}

function evmAccount(seedByte = 9) {
  const secret = new Uint8Array(32).fill(seedByte)
  const address = evmAddressOf(secp256k1.getPublicKey(secret, false))
  const sign = (m: string) => {
    const rec = secp256k1.sign(eip191Hash(m), secret, { prehash: false, format: 'recovered' })
    // personal_sign's r ‖ s ‖ v, v = 27 + recovery.
    return hex(rec.slice(1)) + (27 + rec[0]).toString(16)
  }
  return { address, sign }
}

describe('profile fields', () => {
  it('normalises handles, links and text', () => {
    expect(
      normalizeProfile('account', {
        name: '  Alice‮  Q  ',
        x: 'https://twitter.com/@alice_q',
        telegram: 't.me/aliceq_bot',
        github: 'github.com/alice-q',
        discord: 'https://discord.gg/AbC-12',
        website: 'alice.example',
        image: 'https://img.example/a.png',
        description: 'line one\r\n\r\n\r\n\r\nline two',
      })
    ).toEqual({
      name: 'Alice Q',
      image: 'https://img.example/a.png',
      description: 'line one\n\nline two',
      website: 'https://alice.example/',
      x: 'alice_q',
      telegram: 'aliceq_bot',
      github: 'alice-q',
      discord: 'AbC-12',
    })
  })

  it('rejects what could mislead or reach private hosts', () => {
    const bad: Record<string, unknown>[] = [
      { name: '0xPQF024…' },
      { name: '​​' + '!!!' },
      { name: 'x'.repeat(33) },
      { image: 'http://img.example/a.png' },
      { image: 'https://127.0.0.1/a.png' },
      { image: 'https://localhost/a.png' },
      { image: 'https://user:pw@img.example/a.png' },
      { website: 'javascript:alert(1)' },
      { x: 'way_too_long_handle_here' },
      { colour: 'red' },
      {},
    ]
    for (const p of bad) expect(() => normalizeProfile('account', p), JSON.stringify(p)).toThrow(ProfileError)
    expect(() => normalizeProfile('token', { name: 'Tether' })).toThrow(/on-chain name/)
  })

  it('is idempotent, so a normalised claim parses back unchanged', () => {
    const once = normalizeProfile('account', { name: ' Bob ', website: 'bob.example', x: '@bob' })
    expect(normalizeProfile('account', once)).toEqual(once)
  })

  it('links handles to their sites', () => {
    expect(socialLinks({ x: 'bob', github: 'bob', website: 'https://www.bob.example/' }).map((l) => l.url)).toEqual([
      'https://www.bob.example/',
      'https://x.com/bob',
      'https://github.com/bob',
    ])
  })
})

describe('profile messages', () => {
  const pq = pqAccount()
  const claim = buildClaim({ network: 'testnet', kind: 'account', subject: pq.address, signer: pq.address, profile: { name: 'Alice', x: '@alice' }, issuedAt: 1791400000 })

  it('round-trips and reads like what it does', () => {
    const msg = profileMessage(claim)
    expect(msg.split('\n').slice(0, 1)).toEqual(['QRDX public profile'])
    expect(msg).toContain(`Account: ${pq.address}`)
    expect(msg).toContain('Name: Alice')
    expect(msg).toContain('X: alice')
    expect(msg).toContain('Issued: 2026-10-07T')
    expect(parseProfileMessage(msg)).toEqual(claim)
  })

  it('rejects a readable part that disagrees with the data', () => {
    const msg = profileMessage(claim).replace('Name: Alice', 'Name: Mallory')
    expect(() => parseProfileMessage(msg)).toThrow(/does not match/)
  })

  it('requires an account to sign its own profile', () => {
    const other = pqAccount(8)
    const forged = { ...claim, signer: other.address }
    expect(() => parseProfileMessage(profileMessage(forged))).toThrow(/signed by the account itself/)
  })

  it('describes removals and token profiles', () => {
    const removal = profileMessage({ ...claim, profile: null })
    expect(removal.startsWith('QRDX public profile removal')).toBe(true)
    expect(parseProfileMessage(removal).profile).toBeNull()
    const token = buildClaim({ network: 'testnet', kind: 'token', subject: '0x4227d3846511a16656b521361c10faf6358f0708', signer: pq.address, profile: { image: 'https://img.example/usdc.png' }, issuedAt: 1791400000 })
    const msg = profileMessage(token)
    expect(msg).toContain(`Creator: ${pq.address}`)
    expect(parseProfileMessage(msg)).toEqual(token)
  })
})

describe('profile signatures', () => {
  it('accepts an ML-DSA-65 signature by the 0xPQ signer', () => {
    const pq = pqAccount()
    const msg = profileMessage(buildClaim({ network: 'testnet', kind: 'account', subject: pq.address, signer: pq.address, profile: { name: 'Alice' } }))
    expect(() => verifySigner(pq.address, msg, pq.sign(msg), pq.publicKey)).not.toThrow()
  })

  it('rejects another key, a tampered message and an unprefixed signature', () => {
    const pq = pqAccount()
    const other = pqAccount(8)
    const msg = 'hello'
    expect(() => verifySigner(pq.address, msg, other.sign(msg), other.publicKey)).toThrow(/not the signer/)
    expect(() => verifySigner(pq.address, msg + '!', pq.sign(msg), pq.publicKey)).toThrow(/does not verify/)
    const raw = hex(ml_dsa65.sign(new TextEncoder().encode(msg), pq.keys.secretKey))
    expect(() => verifySigner(pq.address, msg, raw, pq.publicKey)).toThrow(/does not verify/)
  })

  it('derives 0xPQ addresses the way the wallet and node do', () => {
    const pq = pqAccount()
    expect(pq.address.toLowerCase()).toBe(`0xpq${hex(keccak_256(pq.keys.publicKey).slice(0, 32))}`)
  })

  it('accepts personal_sign by the 0x signer and rejects others', () => {
    const a = evmAccount(9)
    const b = evmAccount(10)
    const msg = 'QRDX public profile\n…'
    expect(() => verifySigner(a.address, msg, a.sign(msg), undefined)).not.toThrow()
    expect(() => verifySigner(a.address, msg, b.sign(msg), undefined)).toThrow(/not the signer/)
    expect(() => verifySigner(a.address, msg + 'x', a.sign(msg), undefined)).toThrow()
  })
})

describe('profile addresses', () => {
  it('accept stored (lower-case) and checksummed forms', async () => {
    const { isAddress } = await import('../../relay/src/profile-claim')
    expect(isAddress('0xpq23f4d362b0d03199c976fa144b6affe89e17b3467bac10205d2e70edf58f3811')).toBe(true)
    expect(isAddress('0xPQ23F4D362B0d03199C976Fa144b6AFfE89E17B3467bAC10205D2e70eDF58F3811')).toBe(true)
    expect(isAddress('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266')).toBe(true)
    expect(isAddress('0xPQ1234')).toBe(false)
  })
})
