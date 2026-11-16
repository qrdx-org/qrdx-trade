import { describe, expect, it } from 'vitest'
import { accountName, subaccountAddress } from '@/lib/subaccounts'

describe('sub-accounts', () => {
  it('derives the address the node gives sub-account n (qrdx-node subaccount_address)', () => {
    // Sub-accounts 0 and 4 of a testnet account, as exchange_getSubaccounts lists them.
    const master = '0xPQCE6f5e2315f167FFE91Aa228D237b8ADB46127F4979f39825Da3fCB8a4EEc680'
    expect(subaccountAddress(master, 0)).toBe('0xSUBA78be740b8361f847e52121d754002d7ecb3f')
    expect(subaccountAddress(master, 4)).toBe('0xSUBA500cc8f7ac270b4d252dacb9c32b5608441d')
  })

  it('names accounts', () => {
    expect(accountName({ kind: 'main', index: null, name: '' })).toBe('Main account')
    expect(accountName({ kind: 'sub', index: 3, name: '' })).toBe('Sub-account 3')
    expect(accountName({ kind: 'sub', index: 3, name: 'Hedges' })).toBe('Hedges')
  })
})
