#!/bin/bash
# QRDX Trade: check the Cloudflare Workers setup (OpenNext) before deploying.

ok=0
check() { if [ -e "$1" ]; then echo "✅ $1"; else echo "❌ $1 (missing)"; ok=1; fi; }

echo "Configuration"
check wrangler.jsonc
check open-next.config.ts
check relay/wrangler.jsonc

echo "Build output (pnpm build:worker)"
check .open-next/worker.js
check .open-next/assets

echo "Worker: $(grep -o '"main": *"[^"]*"' wrangler.jsonc | cut -d'"' -f4) · compatibility $(grep -o '"compatibility_date": *"[^"]*"' wrangler.jsonc | cut -d'"' -f4)"
pnpm exec wrangler whoami >/dev/null 2>&1 && echo "✅ wrangler is logged in" || { echo "❌ wrangler is not logged in (pnpm exec wrangler login, or CLOUDFLARE_API_TOKEN)"; ok=1; }

echo
echo "Deploy: pnpm deploy   (relay, then site)   ·   Run locally: pnpm preview"
exit $ok
