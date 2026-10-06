/**
 * End to end: the QRDX Wallet extension trading on this site against the local
 * node harness (qrdx-node's real exchange engine). Checks connect, network
 * switch, decoded approvals, two orders in one block window, an inverted-pair
 * order, cancel, a market swap, a perps deposit + long, a coin launch with a
 * first buy on its curve, a token created alone whose market starts later, and
 * a new perp market created on testnet.
 *
 * Prerequisites (mono-repo layout: ../qrdx-wallet, ../qrdx-node):
 *   1. (cd ../qrdx-wallet && pnpm install && pnpm extension:build)
 *   2. BLOCK_SECONDS=8 PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/local-node/node_harness.py
 *      (fresh start: the test expects an empty order history for its account)
 *   3. NEXT_PUBLIC_QRDX_TEST_NETWORK=local pnpm dev -p 3100   (the local node serves as testnet: /api/v1-test)
 *   4. node tests/e2e/trade-wallet.mjs        (SHOTS=dir to keep screenshots)
 *
 * Playwright comes from the wallet's install (QRDX_WALLET_DIR overrides the path).
 */
import { createRequire } from 'module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
const WALLET = resolve(process.env.QRDX_WALLET_DIR || new URL('../../../qrdx-wallet', import.meta.url).pathname)
const require = createRequire(`${WALLET}/package.json`)
const { chromium } = require('playwright')

const EXT = `${WALLET}/dist/chrome`
const SITE = 'http://127.0.0.1:3100'
const NODE = 'http://127.0.0.1:3007'
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), 'qrdx-shots-'))
const failures = []
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const rpc = async (method, params = []) =>
  (await (await fetch(`${NODE}/rpc`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result
const closedOk = (e) => {
  if (!/closed/.test(String(e))) throw e
}
const api = async (path) => (await fetch(`${SITE}${path.replace('/api/v1/', '/api/v1-test/')}`)).json()

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'qrdx-e2e-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
let [sw] = ctx.serviceWorkers()
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15_000 })
const extId = new URL(sw.url()).host

// ── wallet: import ───────────────────────────────────────────────────────────
console.log('Wallet onboarding')
const popup = await ctx.newPage()
await popup.goto(`chrome-extension://${extId}/popup/index.html`)
const PASSWORD = 'CorrectHorseBattery9!'
await popup.getByRole('button', { name: /already have a wallet/ }).click()
await popup.getByRole('button', { name: /Recovery phrase/ }).click()
await popup.locator('textarea').fill('test test test test test test test test test test test junk')
await popup.getByRole('button', { name: /^Continue/ }).click()
await popup.getByLabel('Password', { exact: true }).fill(PASSWORD)
await popup.getByLabel('Confirm password').fill(PASSWORD)
await popup.getByRole('button', { name: /Import wallet/ }).click()
await popup.getByText('Secure this device').waitFor({ timeout: 60_000 })
check('wallet imported', true)
await popup.close()

// approvals open as new pages; take the next one
const nextApproval = () => ctx.waitForEvent('page', { timeout: 30_000, predicate: (p) => p.url().includes('approval=') })

// ── site: connect ────────────────────────────────────────────────────────────
console.log('Connect from trade.qrdx.org')
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('   pageerror:', e.message))
await page.goto(`${SITE}/trade/btc/usdc`, { waitUntil: 'networkidle' })
await page.getByRole('navigation').getByRole('button', { name: /^Connect$/ }).click()
check('connect offers the extension and a phone', await page.getByTestId('connect-phone').isVisible() && await page.getByTestId('connect-extension').isVisible())
let ap = nextApproval()
await page.getByTestId('connect-extension').click()
let approval = await ap
await approval.getByRole('button', { name: /Connect/ }).click().catch(closedOk)
const accounts = await page.evaluate(() => window.qrdx.request({ method: 'qrdx_accounts' }))
const pq = accounts[0]?.pqAddress
check('site connected; trading account is the PQ address', /^0xPQ[0-9a-f]{64}$/i.test(pq ?? ''), pq)

// network: the wallet starts on mainnet, so the site shows mainnet; choose the test
// network (here the local node) in the nav, which asks the wallet to switch.
check('site follows the wallet: mainnet', !(await page.getByText(/API: \/api\/v1-test/).isVisible().catch(() => false)))
ap = nextApproval()
await page.getByRole('button', { name: /^(Testnet|Local)$/ }).click()
approval = await ap
await approval.getByRole('button', { name: /Switch/ }).click().catch(closedOk)
await page.getByText(/API: \/api\/v1-test/).waitFor({ timeout: 15_000 })
const chain = await page.evaluate(() => window.qrdx.request({ method: 'qrdx_chainInfo' }))
check('wallet switched; site now on the test network', chain.chainId === 9999, `${chain.name} ${chain.chainId}`)
const mainIdx = await (await fetch(`${SITE}/api/v1`)).json()
const testIdx = await (await fetch(`${SITE}/api/v1-test`)).json()
check('/api/v1 and /api/v1-test serve different networks', mainIdx.network === 'mainnet' && testIdx.chainId === 9999, `${mainIdx.network} / ${testIdx.network}`)

await fetch(`${NODE}/faucet`, { method: 'POST', body: JSON.stringify({ address: pq }) })
await page.waitForTimeout(7000) // account poll
const balanceText = await page.locator('text=Available').locator('..').first().innerText()
check('order form shows the funded USDC balance', /[1-9],000,000(\.|\s|$)/.test(balanceText), balanceText.replace(/\n/g, ' '))

// ── spot: two limit orders inside one block window (nonce tracking) ─────────
console.log('Spot limit orders (BTC/USDC)')
const book = await api('/api/v1/markets/btc/usdc/orderbook?depth=5')
const bidPrice = (Number(book.bestBid) * 0.99).toFixed(1)
const priceInput = page.locator('label:has-text("Price") input').first()
const sizeInput = page.locator('label:has-text("Size") input').first()

async function placeBuy(size, expectHeadline) {
  await priceInput.fill(bidPrice)
  await sizeInput.fill(size)
  const a = nextApproval()
  await page.getByRole('button', { name: /^Buy BTC$/ }).click()
  const win = await a
  await win.waitForLoadState()
  const headline = await win.getByText(expectHeadline).first().waitFor({ timeout: 15_000 }).then(() => true, () => false)
  await win.screenshot({ path: `${SHOTS}/approval-${size}.png` })
  await win.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
  await page.getByText(/Submitted\./).waitFor({ timeout: 30_000 })
  return headline
}
const nonceBefore = await rpc('exchange_getNonce', [pq])
check('approval shows a decoded order', await placeBuy('0.01', new RegExp(`Buy 0\\.01 qBTC at ${Number(bidPrice).toLocaleString('en-US')}`)))
check('second order in the same block window is accepted', await placeBuy('0.02', /Buy 0\.02 qBTC/))

console.log('   waiting for a block…')
let orders = []
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000)
  orders = (await api(`/api/v1/accounts/${pq}`)).spotOrders
  if (orders.length >= 2) break
}
check('both orders rest on the book after the block', orders.length === 2, JSON.stringify(orders.map((o) => `${o.side} ${o.amount}@${o.price}`)))
check('exchange nonce advanced by 2', (await rpc('exchange_getNonce', [pq])) === nonceBefore + 2)
const levels = (await api('/api/v1/markets/btc/usdc/orderbook?depth=50')).bids.map((l) => l[0])
check('the order book shows the new bid level', levels.some((p) => Math.abs(Number(p) - Number(bidPrice)) < 0.01), bidPrice)

// ── spot: inverted market (ETH/USDC: ETH is token1 on the node) ─────────────
console.log('Inverted market order (ETH/USDC)')
await page.goto(`${SITE}/trade/eth/usdc`, { waitUntil: 'networkidle' })
const ethBook = await api('/api/v1/markets/eth/usdc/orderbook?depth=5')
const ethPrice = (Number(ethBook.bestBid) * 0.98).toFixed(2)
await page.locator('label:has-text("Price") input').first().fill(ethPrice)
await page.locator('label:has-text("Size") input').first().fill('0.5')
ap = nextApproval()
await page.getByRole('button', { name: /^Buy ETH$/ }).click()
approval = await ap
// The node sees this as selling USDC (token0) for ETH at 1/price.
check('approval shows the canonical (node-side) order', await approval.getByText(/^Sell [\d,.]+ qUSDC at 0\.000/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
check('approval also shows it as the user placed it', await approval.getByText(new RegExp(`Buy 0\\.5 qETH at ${Number(ethPrice).toLocaleString('en-US')}`)).first().waitFor({ timeout: 5_000 }).then(() => true, () => false), ethPrice)
await approval.screenshot({ path: `${SHOTS}/approval-inverted.png` })
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
await page.getByText(/Submitted\./).waitFor({ timeout: 30_000 })
let ethOrder
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000)
  ethOrder = (await api(`/api/v1/accounts/${pq}`)).spotOrders.find((o) => o.market === 'eth/usdc')
  if (ethOrder) break
}
check(
  'inverted order reads back as the order the user placed',
  ethOrder && ethOrder.side === 'buy' && Math.abs(Number(ethOrder.price) - Number(ethPrice)) < 1e-6 && Math.abs(Number(ethOrder.amount) - 0.5) < 1e-9,
  ethOrder && `${ethOrder.side} ${ethOrder.amount} @ ${ethOrder.price}`
)

// ── cancel ──────────────────────────────────────────────────────────────────
console.log('Cancel')
await page.getByRole('button', { name: /Open orders/ }).click()
ap = nextApproval()
await page.getByRole('button', { name: /^Cancel$/ }).first().click()
approval = await ap
check('cancel approval is decoded', await approval.getByText(/^Cancel order /).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000)
  if ((await api(`/api/v1/accounts/${pq}`)).spotOrders.length === 2) break
}
check('order cancelled after the block', (await api(`/api/v1/accounts/${pq}`)).spotOrders.length === 2)

// ── market order: SWAP through the router ───────────────────────────────────
console.log('Market buy (swap)')
await page.goto(`${SITE}/trade/btc/usdc`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Market$/ }).click()
await page.locator('label:has-text("Spend") input').fill('1000')
await page.getByText(/Est\. receive/).waitFor()
await page.waitForTimeout(2500)
const btcBefore = (await api(`/api/v1/accounts/${pq}`)).balances.find((b) => b.asset.slug === 'btc').balance
ap = nextApproval()
await page.getByRole('button', { name: /^Buy BTC$/ }).click()
approval = await ap
await approval.waitForLoadState(); await approval.waitForTimeout(2500); await approval.screenshot({ path: `${SHOTS}/approval-swap.png` })
check('swap approval states the minimum out', await approval.getByText(/^Swap 1,000 qUSDC for at least /).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
await page.getByText(/Submitted\./).waitFor({ timeout: 30_000 })
let btcAfter = btcBefore
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000)
  btcAfter = (await api(`/api/v1/accounts/${pq}`)).balances.find((b) => b.asset.slug === 'btc').balance
  if (btcAfter !== btcBefore) break
}
const got = Number(btcAfter) - Number(btcBefore)
check('swap executed; BTC received at roughly the index price', got > 0 && Math.abs(1000 / got / 85000 - 1) < 0.02, `${got.toFixed(8)} BTC (~${(1000 / got).toFixed(0)} USDC/BTC)`)

// ── perps ───────────────────────────────────────────────────────────────────
console.log('Perps: deposit, long, close')
await page.goto(`${SITE}/perps/btc/usd`, { waitUntil: 'networkidle' })
await page.getByPlaceholder(/Amount \(/).fill('50000')
ap = nextApproval()
await page.getByRole('button', { name: /^Deposit$/ }).click()
approval = await ap
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
await page.getByRole('button', { name: /^Market$/ }).click()
await page.locator('label:has-text("Size") input').fill('0.1')
await page.waitForTimeout(500)
// the deposit is still pending, so free collateral may read 0: wait for it
for (let i = 0; i < 20; i++) {
  const perp = (await api(`/api/v1/accounts/${pq}`)).perp
  if (perp && Number(perp.withdrawable) > 0) break
  await page.waitForTimeout(3000)
}
await page.waitForTimeout(7000)
ap = nextApproval()
await page.getByRole('button', { name: /^Long BTC$/ }).click()
approval = await ap
check('perp approval is decoded as an IOC order', await approval.getByText(/^buy 0\.1 BTC-USD-PERP at up to/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
let pos
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000)
  pos = (await api(`/api/v1/accounts/${pq}`)).perp?.positions?.['BTC-USD-PERP']
  if (pos && Number(pos.size) !== 0) break
}
check('long position opened', pos && Number(pos.size) === 0.1, pos && `size ${pos.size} entry ${pos.entry_price}`)
await page.waitForTimeout(7000)
await page.screenshot({ path: `${SHOTS}/e2e-perps.png` })

// ── launch a coin ───────────────────────────────────────────────────────────
console.log('Launch: token + pool in one block, then the curve')
await page.goto(`${SITE}/launch`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('Quantum Frog').fill('Quantum Frog')
await page.getByPlaceholder('QFROG').fill('QFROG')
// Keep 10 % of the supply, and keep the right to mint more.
await page.getByRole('button', { name: '10%', exact: true }).click()
await page.getByRole('button', { name: 'I can mint', exact: true }).click()
await page.waitForTimeout(3000) // assets, prices and the QRDX balance load
ap = nextApproval()
await page.getByRole('button', { name: /^Launch QFROG$/ }).click()
approval = await ap
check('deploy approval is decoded, and says it is mintable', await approval.getByText(/^Create token Quantum Frog \(QFROG\) with 1,000,000,000 supply/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false) && await approval.getByText(/able to mint more QFROG/).first().isVisible())
ap = nextApproval()
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
approval = await ap
check('pool approval names the not-yet-created token and the burn', await approval.getByText(/^Create pool wQRDX\/0x[0-9a-f]{6}…/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false) && await approval.getByText(/5,000 QRDX is burned/).first().isVisible())
await approval.screenshot({ path: `${SHOTS}/approval-create-pool.png` })
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
const deposit = page.getByRole('button', { name: /^Deposit 900\.00M QFROG on the curve$/ })
await deposit.waitFor({ timeout: 90_000 })
check('token and pool created in one block', true)
ap = nextApproval()
await deposit.click()
approval = await ap
check('curve approval shows a one-sided deposit', await approval.getByText(/^Add liquidity to /).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
await page.getByRole('link', { name: /^Trade QFROG$/ }).waitFor({ timeout: 90_000 })
await page.screenshot({ path: `${SHOTS}/launch-done.png` })
let launched
for (let i = 0; i < 10 && !launched?.market; i++) {
  launched = (await api('/api/v1/launches')).launches.find((l) => l.token.symbol === 'QFROG')
  if (!launched?.market) await page.waitForTimeout(2000)
}
check(
  'launch feed lists it with a market, mintable, not freezable',
  launched && launched.market && !launched.fixedSupply && !launched.freezable,
  launched && `${launched.token.address} · price ${launched.market?.price} ${launched.market?.quote.symbol} · cap ${launched.market?.marketCap}`
)
const startPrice = Number(launched?.market?.price)

console.log('Buy on the curve')
await page.getByRole('link', { name: /^Trade QFROG$/ }).click()
await page.waitForURL(/\/trade\/0x[0-9a-f]{40}\/qrdx/, { timeout: 30_000 })
await page.getByText(/unverified token/).first().waitFor({ timeout: 30_000 })
await page.getByRole('button', { name: /^Market$/ }).click()
await page.locator('label:has-text("Spend") input').fill('1000')
await page.waitForTimeout(3000)
ap = nextApproval()
await page.getByRole('button', { name: /^Buy QFROG$/ }).click()
approval = await ap
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
let after = startPrice
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000)
  const l = (await api('/api/v1/launches')).launches.find((x) => x.token.symbol === 'QFROG')
  after = Number(l?.market?.price)
  if (after > startPrice) break
}
// No ?tokens=: the account read must include unverified coins on its own (pool and sell forms rely on it).
const frog = (await api(`/api/v1/accounts/${pq}`)).balances.find((b) => b.asset.address === launched?.token.address)
check('buying walked the price up the curve', after > startPrice, `${startPrice} → ${after} QRDX`)
check('the creator kept 10 % plus what it bought', frog && Number(frog.balance) > 100_000_000, frog && `${frog.balance} QFROG`)

console.log('Mint more, then give up minting')
await page.goto(`${SITE}/launch`, { waitUntil: 'networkidle' })
const card = page.getByTestId('token-QFROG')
await card.waitFor({ timeout: 30_000 })
await card.getByRole('button', { name: /^Mint$/ }).click()
await card.getByPlaceholder(/Amount of QFROG/).fill('5000')
ap = nextApproval()
await card.getByRole('button', { name: /^Mint 5000 QFROG$/ }).click()
approval = await ap
check('mint approval is decoded', await approval.getByText(/^Mint 5,000 new QFROG to you$/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
let supply
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000)
  supply = (await api('/api/v1/assets?all=1')).tokens.find((t) => t.symbol === 'QFROG')?.totalSupply
  if (supply === '1000005000') break
}
check('supply grew by the minted amount', supply === '1000005000', supply)
await card.getByRole('button', { name: /^Give up minting$/ }).click()
ap = nextApproval()
await card.getByRole('button', { name: /^Give up minting QFROG for good$/ }).click()
approval = await ap
check('renounce approval warns it is permanent', await approval.getByText(/no one will ever be able to mint QFROG again/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
let authority = 'x'
for (let i = 0; i < 20 && authority; i++) {
  await page.waitForTimeout(3000)
  authority = (await api('/api/v1/assets?all=1')).tokens.find((t) => t.symbol === 'QFROG')?.mintAuthority
}
check('minting given up: the supply is now fixed', authority === null)
await page.screenshot({ path: `${SHOTS}/your-tokens.png` })

// ── token only, market later ────────────────────────────────────────────────
console.log('Token only, then its market later')
await page.goto(`${SITE}/launch`, { waitUntil: 'networkidle' })
const another = page.getByRole('button', { name: /^Create another$/ })
if (await another.isVisible().catch(() => false)) await another.click()
await page.getByRole('button', { name: /^Token only$/ }).click()
await page.getByPlaceholder('Quantum Frog').fill('Later Coin')
await page.getByPlaceholder('QFROG').fill('LATER')
await page.waitForTimeout(2000)
ap = nextApproval()
await page.getByRole('button', { name: /^Create LATER$/ }).click()
approval = await ap
check('token-only approval is a single deploy', await approval.getByText(/^Create token Later Coin \(LATER\)/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
const startMarket = page.getByRole('button', { name: /^Start its market/ })
await startMarket.waitFor({ timeout: 90_000 })
let later
for (let i = 0; i < 10 && !later; i++) {
  later = (await api('/api/v1/launches')).launches.find((l) => l.token.symbol === 'LATER')
  if (!later) await page.waitForTimeout(2000)
}
check('token exists with no market', later && later.market === null && later.fixedSupply, later?.token.address)

await startMarket.click()
await page.waitForURL(/\/launch\?token=0x[0-9a-f]{40}/)
await page.getByText(/^Start a market for LATER$/).waitFor({ timeout: 30_000 })
await page.waitForTimeout(3000)
ap = nextApproval()
await page.getByRole('button', { name: /^Start LATER market$/ }).click()
approval = await ap
check('pool approval names the existing token', await approval.getByText(/^Create pool .*LATER/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false))
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
const depositLater = page.getByRole('button', { name: /^Deposit .* LATER on the curve$/ })
await depositLater.waitFor({ timeout: 90_000 })
ap = nextApproval()
await depositLater.click()
approval = await ap
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
await page.getByRole('link', { name: /^Trade LATER$/ }).waitFor({ timeout: 90_000 })
later = undefined
for (let i = 0; i < 10 && !later?.market; i++) {
  later = (await api('/api/v1/launches')).launches.find((l) => l.token.symbol === 'LATER')
  if (!later?.market) await page.waitForTimeout(2000)
}
check('market started later for the existing token', !!later?.market, later?.market && `${later.market.price} ${later.market.quote.symbol}`)
await page.screenshot({ path: `${SHOTS}/launch-later.png` })

// ── create a perp market (testnet) ─────────────────────────────────────────
console.log('Create a perp market')
await page.goto(`${SITE}/perps/new`, { waitUntil: 'networkidle' })
await page.getByLabel('Underlying asset symbol').fill('SOL')
check('the form checks validators can price it', await page.getByText(/Validators can price SOL/).waitFor({ timeout: 30_000 }).then(() => true, () => false))
ap = nextApproval()
await page.getByRole('button', { name: /^Create SOL-USD market/ }).click()
approval = await ap
check(
  'create-market approval is decoded',
  await approval.getByText(/^Create the SOL-USD perpetual market, up to 10× leverage$/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false)
)
await approval.getByRole('button', { name: /^Confirm$/ }).click().catch(closedOk)
let sol
for (let i = 0; i < 20 && !sol; i++) {
  await page.waitForTimeout(3000)
  sol = (await api('/api/v1/perps')).perps.find((m) => m.id === 'SOL-USD-PERP')
}
check('market exists after the block', !!sol, sol && `${sol.id} · max ${sol.maxLeverage}×`)
check('the form follows it to created', await page.getByRole('link', { name: /^Open SOL-USD-PERP/ }).waitFor({ timeout: 30_000 }).then(() => true, () => false))
await page.screenshot({ path: `${SHOTS}/perp-created.png` })

// ── transactions tab ────────────────────────────────────────────────────────
await page.goto(`${SITE}/perps/btc/usd`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Transactions/ }).click()
await page.waitForTimeout(6000)
const txText = await page.locator('table').last().innerText()
check('transactions tab lists executed operations', /Executed in block/.test(txText))
await page.screenshot({ path: `${SHOTS}/e2e-transactions.png` })

await ctx.close()
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nALL PASSED')
process.exit(failures.length ? 1 : 0)
