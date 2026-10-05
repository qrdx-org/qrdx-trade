/**
 * End to end: QRDX Connect. The QRDX Wallet web app in a phone-sized browser
 * connects to this site in a desktop browser by its pairing link, through the
 * real relay (wrangler dev), and approves trades on the local node.
 *
 * Prerequisites (mono-repo layout: ../qrdx-wallet, ../qrdx-node):
 *   1. (cd ../qrdx-wallet && pnpm install && BUILD_TARGET=web pnpm build)     → ../qrdx-wallet/out
 *   2. BLOCK_SECONDS=8 PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/local-node/node_harness.py
 *   3. pnpm relay:dev                                                          → relay on :8787
 *   4. NEXT_PUBLIC_QRDX_TEST_NETWORK=local \
 *      NEXT_PUBLIC_QRDX_RELAY_URL=http://127.0.0.1:8787/api/relay \
 *      NEXT_PUBLIC_QRDX_WALLET_URL=http://127.0.0.1:3200 pnpm dev -p 3100
 *   5. node tests/e2e/trade-phone.mjs     (serves the wallet on :3200 itself; SHOTS=dir keeps screenshots)
 */
import { createRequire } from 'module'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'

const WALLET = resolve(process.env.QRDX_WALLET_DIR || new URL('../../../qrdx-wallet', import.meta.url).pathname)
const require = createRequire(`${WALLET}/package.json`)
const { chromium, devices } = require('playwright')

const SITE = 'http://127.0.0.1:3100'
const NODE = 'http://127.0.0.1:3007'
const WALLET_URL = 'http://127.0.0.1:3200'
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), 'qrdx-shots-'))
const PASSWORD = 'CorrectHorseBattery9!'

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const api = async (path) => (await fetch(`${SITE}${path}`)).json()
const visible = (loc, timeout = 30_000) => loc.first().waitFor({ timeout }).then(() => true, () => false)

// ── the wallet web app (static export), as the phone loads it ──
const OUT = join(WALLET, 'out')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' }
const server = createServer(async (req, res) => {
  const url = new URL(req.url, WALLET_URL)
  let path = url.pathname === '/' ? '/index.html' : url.pathname
  if (!extname(path)) path += '.html'
  try {
    const body = await readFile(join(OUT, path))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
}).listen(3200, '127.0.0.1')

const browser = await chromium.launch()
const phoneCtx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' })
const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })

// ── phone: import a wallet ──
console.log('Phone: wallet web app')
let phone = await phoneCtx.newPage()
phone.on('pageerror', (e) => console.log('   phone pageerror:', e.message))
await phone.goto(`${WALLET_URL}/wallet`)
await phone.getByRole('button', { name: /already have a wallet/ }).click()
await phone.getByRole('button', { name: /Recovery phrase/ }).click()
await phone.locator('textarea').fill('test test test test test test test test test test test junk')
await phone.getByRole('button', { name: /^Continue/ }).click()
await phone.getByLabel('Password', { exact: true }).fill(PASSWORD)
await phone.getByLabel('Confirm password').fill(PASSWORD)
await phone.getByRole('button', { name: /Import wallet/ }).click()
await phone.getByText('Secure this device').waitFor({ timeout: 60_000 })
await phone.getByRole('button', { name: /^Continue/ }).click()
await phone.getByRole('button', { name: /Open wallet/ }).click()
check('phone wallet ready', await visible(phone.getByRole('button', { name: 'Connect to a site' })))

// ── desktop: no extension; connect a phone ──
console.log('Desktop: connect by QR')
const desk = await deskCtx.newPage()
desk.on('pageerror', (e) => console.log('   desk pageerror:', e.message))
await desk.goto(`${SITE}/trade/btc/usdc`, { waitUntil: 'networkidle' })
await desk.getByRole('navigation').getByRole('button', { name: /^Connect$/ }).click()
await desk.getByTestId('connect-phone').click()
const linkEl = desk.getByTestId('pairing-link')
await linkEl.waitFor({ timeout: 30_000 })
const link = await linkEl.getAttribute('data-link')
check('site shows a QR code with a wallet pairing link', !!link && link.startsWith(`${WALLET_URL}/wallet?connect=qrdx-connect`), link?.slice(0, 60))
check('the QR is rendered', await visible(desk.locator('[role="dialog"] svg')))
await desk.screenshot({ path: `${SHOTS}/connect-qr.png` })
// Decode the QR on screen with jsQR, the decoder the wallet's scanner uses on iPhone.
await desk.addScriptTag({ path: require.resolve('jsqr') })
const decoded = await desk.evaluate(async () => {
  const svg = document.querySelector('[role="dialog"] svg')
  const img = new Image()
  img.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg))
  await img.decode()
  const c = document.createElement('canvas')
  c.width = c.height = 400
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 400, 400)
  ctx.drawImage(img, 40, 40, 320, 320)
  return window.jsQR(ctx.getImageData(0, 0, 400, 400).data, 400, 400)?.data ?? null
})
check('the QR decodes to the pairing link', decoded === link)

// ── phone: paste the link (what the scanner reads), approve the connection ──
await phone.getByRole('button', { name: 'Connect to a site' }).click()
await phone.getByLabel('Connection link').fill(link)
await phone.getByRole('button', { name: 'Connect with this link' }).click()
check('phone shows the connect approval, with the scanned-code warning', await visible(phone.getByText(/Connecting through a scanned code/)))
check('approval names the site the relay attested', await visible(phone.getByText(/127\.0\.0\.1:3100/)))
await phone.screenshot({ path: `${SHOTS}/phone-connect.png` })
await phone.getByRole('button', { name: /^Connect$/ }).click()
check('desktop connected through the phone', await visible(desk.getByRole('button', { name: /0xPQ/ }), 30_000))
const cached = await desk.evaluate(() => JSON.parse(localStorage.getItem('qrdx-trade:connect') || '{}'))
const pq = cached.accounts?.[0]?.pqAddress
check('trading account is the phone wallet’s PQ address', /^0xPQ[0-9a-fA-F]{64}$/.test(pq ?? ''), pq)

// ── network: switch the phone wallet to the test network from the site ──
console.log('Network switch, approved on the phone')
await desk.getByRole('button', { name: /^(Testnet|Local)$/ }).click()
check('phone asks to switch network', await visible(phone.getByRole('button', { name: /^Switch$/ })))
await phone.getByRole('button', { name: /^Switch$/ }).click()
check('site follows the phone to the test network', await visible(desk.getByText(/API: \/api\/v1-test/), 30_000))

// ── trade: an order placed on the desktop, approved on the phone ──
console.log('Order: placed on the desktop, approved on the phone')
await fetch(`${NODE}/faucet`, { method: 'POST', body: JSON.stringify({ address: pq }) })
await desk.waitForTimeout(7000)
const book = await api('/api/v1-test/markets/btc/usdc/orderbook?depth=5')
const bid = (Number(book.bestBid) * 0.99).toFixed(1)
await desk.locator('label:has-text("Price") input').first().fill(bid)
await desk.locator('label:has-text("Size") input').first().fill('0.01')
await desk.getByRole('button', { name: /^Buy BTC$/ }).click()
check('phone shows the decoded order', await visible(phone.getByText(new RegExp(`^Buy 0\\.01 qBTC at ${Number(bid).toLocaleString('en-US')}`))))
await phone.screenshot({ path: `${SHOTS}/phone-order.png` })
await phone.getByRole('button', { name: /^Confirm$/ }).click()
check('desktop: submitted', await visible(desk.getByText(/Submitted\./), 30_000))
let orders = []
for (let i = 0; i < 20 && !orders.length; i++) {
  await desk.waitForTimeout(3000)
  orders = (await api(`/api/v1-test/accounts/${pq}`)).spotOrders
}
check('the order rests on the book', orders.length === 1 && orders[0].price === bid, JSON.stringify(orders.map((o) => `${o.side} ${o.amount}@${o.price}`)))
await desk.screenshot({ path: `${SHOTS}/desk-after-order.png` })

// ── the phone app closes and comes back ──
console.log('Phone closes and reopens')
await phone.close()
check('site shows the phone is closed', await visible(desk.getByText(/QRDX Wallet on your phone is closed/), 30_000))
phone = await phoneCtx.newPage()
await phone.goto(`${WALLET_URL}/wallet`)
await phone.getByLabel('Password', { exact: true }).fill(PASSWORD)
await phone.getByRole('button', { name: /^Unlock$/ }).click()
check('session restored after reopening', await visible(phone.getByText(/Keep this app open while you trade/)))
check('site sees the phone again', await desk.getByText(/QRDX Wallet on your phone is closed/).waitFor({ state: 'hidden', timeout: 30_000 }).then(() => true, () => false))

// ── a request made while the phone was away is handled when it returns ──
console.log('Cancel queued while the phone is locked')
await phone.getByRole('button', { name: /Lock/ }).last().click().catch(() => undefined)
await desk.getByRole('button', { name: /Open orders/ }).click()
await desk.getByRole('button', { name: /^Cancel$/ }).first().click()
await phone.getByLabel('Password', { exact: true }).waitFor({ timeout: 15_000 }).catch(() => undefined)
if (await phone.getByLabel('Password', { exact: true }).isVisible().catch(() => false)) {
  await phone.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await phone.getByRole('button', { name: /^Unlock$/ }).click()
}
check('phone shows the cancel after unlocking', await visible(phone.getByText(/^Cancel order /)))
await phone.getByRole('button', { name: /^Confirm$/ }).click()
for (let i = 0; i < 20 && orders.length; i++) {
  await desk.waitForTimeout(3000)
  orders = (await api(`/api/v1-test/accounts/${pq}`)).spotOrders
}
check('order cancelled', orders.length === 0)

// ── disconnect from the phone ──
console.log('Disconnect from the phone')
await phone.getByRole('button', { name: /Disconnect/ }).first().click()
check('site disconnects when the phone ends the session', await visible(desk.getByRole('button', { name: /^Connect$/ }), 30_000))

await browser.close()
server.close()
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nALL PASSED')
process.exit(failures.length ? 1 : 0)
