#!/bin/bash

# QRDX Trade - Quick Start Script

echo "🚀 QRDX Trade Setup"
echo "===================="
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm not found. Installing pnpm..."
    npm install -g pnpm
fi

echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "✨ Setup complete!"
echo ""
echo "Available commands:"
echo "  pnpm dev      - Start development server"
echo "  pnpm build    - Build for production"
echo "  pnpm start    - Start production server"
echo "  pnpm lint     - Run ESLint"
echo ""
echo "🎉 Run 'pnpm dev' to start developing!"
