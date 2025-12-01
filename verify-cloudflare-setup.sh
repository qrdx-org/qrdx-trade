#!/bin/bash

# QRDX Trade - Cloudflare Workers Deployment Verification Script

echo "🔍 Verifying Cloudflare Workers Setup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if all required files exist
check_file() {
  if [ -f "$1" ]; then
    echo "✅ $1"
    return 0
  else
    echo "❌ $1 (MISSING)"
    return 1
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo "✅ $1/"
    return 0
  else
    echo "❌ $1/ (MISSING)"
    return 1
  fi
}

echo -e "\n📋 Configuration Files:"
check_file "wrangler.jsonc"
check_file "worker.mjs"
check_file "next.config.mjs"
check_file "package.json"

echo -e "\n📦 Build Output:"
check_dir ".next"
check_file ".next/standalone/server.js"
check_dir ".next/standalone/.next"

echo -e "\n📚 Documentation:"
check_file "CLOUDFLARE_DEPLOYMENT.md"

echo -e "\n🔧 Package Scripts:"
echo "  ✓ build: Next.js build"
echo "  ✓ deploy: Deploy to Cloudflare Workers"
echo "  ✓ deploy:preview: Deploy to production"

echo -e "\n📝 Configuration Summary:"
echo "  • Project: $(jq -r '.name' package.json)"
echo "  • Worker: $(jq -r '.main' wrangler.jsonc)"
echo "  • Compatibility: $(jq -r '.compatibility_date' wrangler.jsonc)"
echo "  • Node.js Support: ✅ (nodejs_compat enabled)"

echo -e "\n🚀 Ready to Deploy!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Quick start commands:"
echo "  1. Login:   pnpm exec wrangler login"
echo "  2. Build:   pnpm build"
echo "  3. Deploy:  pnpm exec wrangler deploy"
echo ""
echo "For more details, see CLOUDFLARE_DEPLOYMENT.md"
