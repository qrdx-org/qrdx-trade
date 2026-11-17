/**
 * Terms acceptance. A new visitor accepts the Terms of Service before using the site
 * (components/chrome/TermsGate.tsx); the acceptance is kept in this browser and asked
 * for again when the Terms change.
 */

export const TERMS_URL = 'https://qrdx.org/terms'
export const PRIVACY_URL = 'https://qrdx.org/privacy'

/** The "Last updated" date on qrdx.org/terms. Change it with the Terms to ask everyone again. */
export const TERMS_VERSION = '2026-11-17'

const KEY = 'qrdx-trade:terms'

interface Accepted {
  version: string
  at: string
}

export function termsAccepted(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Accepted | null
    return v?.version === TERMS_VERSION
  } catch {
    return false
  }
}

export function acceptTerms(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: TERMS_VERSION, at: new Date().toISOString() } satisfies Accepted))
  } catch {
    /* storage unavailable: accepted for this page only */
  }
}
