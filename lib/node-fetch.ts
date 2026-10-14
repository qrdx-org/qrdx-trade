/**
 * GET JSON from the node, paced for its per-client limits (`/get_address_history` allows 8 a
 * second): a short gap before each call, and a retry with backoff when it answers 429.
 */
export async function nodeGetPaced<T>(url: string, gapMs = 150): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await new Promise((r) => setTimeout(r, attempt ? gapMs * 2 ** attempt * 2 : gapMs))
    const res = await fetch(url, { cache: 'no-store' })
    if (res.status === 429 && attempt < 4) continue
    if (!res.ok) throw new Error(`The node answered ${res.status}`)
    return (await res.json()) as T
  }
}
