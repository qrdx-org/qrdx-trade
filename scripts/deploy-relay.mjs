#!/usr/bin/env node
/**
 * Deploy the QRDX Connect relay (relay/, docs/CONNECT.md) as part of the site
 * build, so `pnpm build:worker` ships both.
 *
 * Why a separate Worker at all: the relay must let two devices meet, which
 * needs state shared across requests. Pages / edge functions are stateless
 * isolates, and Cloudflare only lets a Worker define a Durable Object; Pages
 * can bind to one but not contain it. So the relay is its own small Worker,
 * deployed from here and routed under trade.qrdx.org/api/relay/*.
 *
 * Runs only where it should:
 *   - skipped when QRDX_SKIP_RELAY_DEPLOY=1;
 *   - in a Cloudflare Pages build, only on the production branch
 *     (CF_PAGES_BRANCH === QRDX_RELAY_BRANCH, default "main"): previews never
 *     replace the live relay;
 *   - skipped, with a note, when there are no Cloudflare credentials
 *     (no CLOUDFLARE_API_TOKEN and no `wrangler login`), so local builds work.
 * When it does run and the deploy fails, the build fails: a site that expects a
 * relay should not ship without one.
 */

import { spawnSync } from 'node:child_process'

const log = (m) => console.log(`[relay] ${m}`)
const env = process.env

if (env.QRDX_SKIP_RELAY_DEPLOY === '1') {
  log('skipped (QRDX_SKIP_RELAY_DEPLOY=1)')
  process.exit(0)
}

const productionBranch = env.QRDX_RELAY_BRANCH || 'main'
if (env.CF_PAGES === '1' && env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== productionBranch) {
  log(`skipped: Pages preview build of "${env.CF_PAGES_BRANCH}" (the relay deploys from "${productionBranch}")`)
  process.exit(0)
}

const wrangler = (args) => spawnSync('npx', ['wrangler', ...args], { stdio: 'pipe', encoding: 'utf8', env })

// A pasted token often carries a trailing newline or quotes; Cloudflare then answers 400 / 9106.
if (env.CLOUDFLARE_API_TOKEN) {
  const clean = env.CLOUDFLARE_API_TOKEN.trim().replace(/^["']|["']$/g, '')
  if (clean !== env.CLOUDFLARE_API_TOKEN) log('note: removed whitespace / quotes around CLOUDFLARE_API_TOKEN')
  env.CLOUDFLARE_API_TOKEN = clean
  // The dashboard's Global API Key is 37 hex characters; API tokens are 40 (letters, digits, - and _).
  if (/^[0-9a-f]{37}$/.test(clean)) {
    log('CLOUDFLARE_API_TOKEN holds a Global API Key, not an API token, so Cloudflare rejects it (400, code 9106).')
    log('Create an API token instead: dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers",')
    log('scoped to your account and the qrdx.org zone, and put that in CLOUDFLARE_API_TOKEN (plus CLOUDFLARE_ACCOUNT_ID).')
    log('(Or use the global key as CLOUDFLARE_API_KEY with CLOUDFLARE_EMAIL; it grants far more than a build needs.)')
    process.exit(1)
  }
}

if (!env.CLOUDFLARE_API_TOKEN && !(env.CLOUDFLARE_API_KEY && env.CLOUDFLARE_EMAIL)) {
  const who = wrangler(['whoami'])
  if (who.status !== 0 || /not authenticated/i.test(`${who.stdout}${who.stderr}`)) {
    log('skipped: no Cloudflare credentials (set CLOUDFLARE_API_TOKEN, or run `npx wrangler login`).')
    log('The site still builds; QRDX Connect needs the relay deployed once: pnpm relay:deploy')
    process.exit(0)
  }
}

log('deploying relay/ (Worker + Durable Object, route trade.qrdx.org/api/relay/*)')
const res = spawnSync('npx', ['wrangler', 'deploy', '--config', 'relay/wrangler.jsonc'], { stdio: 'inherit', env })
if (res.status !== 0) {
  log('deploy failed. Set QRDX_SKIP_RELAY_DEPLOY=1 to build the site without it.')
  process.exit(res.status ?? 1)
}
log('deployed')
