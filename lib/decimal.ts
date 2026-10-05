/**
 * Exact decimal arithmetic on strings, for prices and amounts.
 *
 * The node reports every amount as a decimal string with at most 18 places
 * (qrdx/exchange/tokens.py: AMOUNT_QUANTUM = 1e-18) and parses what we sign the
 * same way. Converting through floats would sign amounts the user did not type
 * and show book levels that do not exist, so anything that is displayed as
 * node data or ends up in a transaction goes through here.
 *
 * Values are bigints scaled by 10^18. Division and inversion round toward zero
 * at 18 places.
 */

export const SCALE = 18
const ONE = 10n ** BigInt(SCALE)

export type Dec = bigint

const DECIMAL_RE = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

/** Parse a decimal string (or safe number) into a scaled bigint. Extra places are truncated. */
export function dec(value: string | number | bigint | null | undefined): Dec {
  if (value === null || value === undefined || value === '') return 0n
  if (typeof value === 'bigint') return value * ONE
  const s = typeof value === 'number' ? numberToString(value) : value.trim()
  const m = DECIMAL_RE.exec(s)
  if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) {
    throw new Error(`Not a decimal number: ${JSON.stringify(value)}`)
  }
  const [, sign, whole, frac = '', exp] = m
  let digits = (whole || '0') + frac
  let point = frac.length - (exp ? parseInt(exp, 10) : 0)
  // Re-express as digits × 10^-point, then rescale to 10^-SCALE.
  let out: bigint
  if (point <= SCALE) {
    out = BigInt(digits) * 10n ** BigInt(SCALE - point)
  } else {
    const cut = point - SCALE
    digits = cut >= digits.length ? '0' : digits.slice(0, digits.length - cut)
    point = SCALE
    out = BigInt(digits)
  }
  return sign === '-' ? -out : out
}

function numberToString(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Not a finite number: ${n}`)
  // toPrecision(17) round-trips every double; dec() parses the exponent form.
  return n.toPrecision(17)
}

/** Format a scaled bigint as a plain decimal string without trailing zeros. */
export function str(x: Dec): string {
  const neg = x < 0n
  const abs = neg ? -x : x
  const whole = abs / ONE
  const frac = (abs % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`
}

export const add = (a: Dec, b: Dec): Dec => a + b
export const sub = (a: Dec, b: Dec): Dec => a - b
export const mul = (a: Dec, b: Dec): Dec => (a * b) / ONE
export function div(a: Dec, b: Dec): Dec {
  if (b === 0n) throw new Error('Division by zero')
  return (a * ONE) / b
}
/** a / b rounded up (away from zero for positive operands). */
export function divUp(a: Dec, b: Dec): Dec {
  if (b === 0n) throw new Error('Division by zero')
  const q = (a * ONE) / b
  return (a * ONE) % b === 0n ? q : q + 1n
}
export const cmp = (a: Dec, b: Dec): number => (a < b ? -1 : a > b ? 1 : 0)
export const isZero = (a: Dec): boolean => a === 0n
export const abs = (a: Dec): Dec => (a < 0n ? -a : a)
export const min = (a: Dec, b: Dec): Dec => (a < b ? a : b)
export const max = (a: Dec, b: Dec): Dec => (a > b ? a : b)

/** String helpers for the common one-liners. */
export const S = {
  add: (a: string, b: string) => str(dec(a) + dec(b)),
  sub: (a: string, b: string) => str(dec(a) - dec(b)),
  mul: (a: string, b: string) => str(mul(dec(a), dec(b))),
  div: (a: string, b: string) => str(div(dec(a), dec(b))),
  /** 1 / a; null for zero. */
  inv: (a: string) => (dec(a) === 0n ? null : str(div(ONE, dec(a)))),
  cmp: (a: string, b: string) => cmp(dec(a), dec(b)),
  isZero: (a: string | null | undefined) => a === null || a === undefined || dec(a) === 0n,
}

/**
 * Round to `places` decimal places (half away from zero) and return a string.
 * For display and for fitting user input to a token's precision.
 */
export function round(value: string, places: number, mode: 'half' | 'down' | 'up' = 'half'): string {
  const x = dec(value)
  if (places >= SCALE) return str(x)
  const unit = 10n ** BigInt(SCALE - places)
  const neg = x < 0n
  const a = neg ? -x : x
  let q = a / unit
  const r = a % unit
  if (mode === 'half' && r * 2n >= unit) q += 1n
  if (mode === 'up' && r > 0n) q += 1n
  const out = q * unit
  return str(neg ? -out : out)
}

/**
 * Lower an amount by a slippage tolerance in percent (e.g. 0.5), rounding down,
 * so `min_amount_out` never exceeds what the user agreed to.
 */
export function lessSlippage(amount: string, slippagePercent: number): string {
  const bps = BigInt(Math.round(slippagePercent * 100))
  if (bps < 0n || bps > 10_000n) throw new Error('Slippage must be between 0 and 100 %')
  return str((dec(amount) * (10_000n - bps)) / 10_000n)
}

/** Percentage change from `from` to `to`, as a string with 2 places; null if from is zero. */
export function pctChange(from: string, to: string): string | null {
  const f = dec(from)
  if (f === 0n) return null
  return round(str(div((dec(to) - f) * 100n, f)), 2)
}

/** Lossy conversion for charts and sorting only — never for amounts that are signed. */
export function toNumber(value: string | null | undefined): number {
  if (value === null || value === undefined || value === '') return NaN
  return Number(value)
}

/** Is this a well-formed, non-negative decimal string with at most `places` decimals? */
export function isAmount(value: string, places = SCALE): boolean {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim())
  return !!m && (m[2]?.length ?? 0) <= places
}
