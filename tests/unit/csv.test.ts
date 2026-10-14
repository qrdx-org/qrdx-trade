import { describe, it, expect } from 'vitest'
import { toCsv } from '../../lib/csv'

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: 'two\nlines' }], [
      { header: 'a', value: (r) => r.a },
      { header: 'b', value: (r) => r.b },
      { header: 'c', value: (r) => r.c },
    ])
    expect(csv).toBe('a,b,c\r\n"x,y","say ""hi""","two\nlines"\r\n')
  })

  it('neutralises formulas but keeps negative numbers', () => {
    const csv = toCsv([{ v: '=HYPERLINK("x")' }, { v: '-12.5' }, { v: '@SUM(A1)' }], [{ header: 'v', value: (r) => r.v }])
    expect(csv.split('\r\n').slice(1, 4)).toEqual([`"'=HYPERLINK(""x"")"`, '-12.5', "'@SUM(A1)"])
  })
})
