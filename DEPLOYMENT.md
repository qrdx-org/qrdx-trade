# QRDX Trade - Deployment Guide

## Production Deployment

### Prerequisites

- Node.js 18+ or Bun runtime
- pnpm package manager
- Static hosting service (Vercel, Netlify, Cloudflare Pages, etc.)

## Build Process

### 1. Environment Setup

Create `.env.local` or configure environment variables in your hosting platform:

```env
NEXT_PUBLIC_API_URL=https://api.qrdx.org
NEXT_PUBLIC_CHAIN_ID=1
NEXT_PUBLIC_SOURCE_MAPS=false
```

### 2. Build Commands

```bash
# Standard build (uses Bun if available)
pnpm build

# Build without Bun runtime
pnpm build:nobun

# Production preview
pnpm start
```

### 3. Output

The build creates a static export in the `out/` directory, which can be deployed to any static hosting service.

## Deployment Options

### Vercel (Recommended)

1. **Connect Repository**
   ```bash
   vercel
   ```

2. **Configure Build Settings**
   - Framework Preset: Next.js
   - Build Command: `pnpm build`
   - Output Directory: `out`
   - Install Command: `pnpm install`

3. **Environment Variables**
   Add environment variables in Vercel dashboard

4. **Custom Domain**
   - Add `trade.qrdx.org` in Domains section
   - Configure DNS records as instructed

### Netlify

1. **netlify.toml Configuration**
   ```toml
   [build]
     command = "pnpm build"
     publish = "out"
   
   [build.environment]
     NODE_VERSION = "18.18.0"
   ```

2. **Deploy**
   ```bash
   netlify deploy --prod
   ```

### Cloudflare Pages

1. **Build Configuration**
   - Build command: `pnpm build`
   - Build output directory: `out`
   - Node version: 18

2. **Deploy**
   - Connect GitHub repository
   - Configure build settings
   - Set environment variables

### Static Hosting (AWS S3, Google Cloud Storage, etc.)

1. **Build**
   ```bash
   pnpm build
   ```

2. **Upload**
   Upload contents of `out/` directory to your static hosting service

3. **Configure**
   - Enable SPA routing (redirect all routes to index.html)
   - Set up HTTPS
   - Configure CORS if needed

## DNS Configuration

### For trade.qrdx.org

Add a CNAME record pointing to your hosting service:

```
Type: CNAME
Name: trade
Value: [your-hosting-url]
```

Or for root domain:

```
Type: A
Name: @
Value: [hosting-ip-address]
```

## Performance Optimization

### 1. CDN Configuration

- Enable CDN caching for static assets
- Set appropriate cache headers
- Use compression (gzip/brotli)

### 2. Asset Optimization

- Images are already optimized for static export
- CSS is minified during build
- JavaScript is bundled and minified

### 3. Monitoring

Set up monitoring for:
- Page load times
- API response times
- Error rates
- User analytics

## CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 10.6.4
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm build
      
      - name: Deploy to hosting
        run: |
          # Add deployment commands here
```

## Rollback Strategy

### Quick Rollback

1. **Vercel**: Use deployment history to rollback
2. **Netlify**: Deploy previous version from UI
3. **Custom**: Keep previous `out/` directory as backup

### Manual Rollback

```bash
# Checkout previous commit
git checkout [previous-commit-hash]

# Rebuild and redeploy
pnpm build
# Deploy out/ directory
```

## Health Checks

Monitor these endpoints:
- `https://trade.qrdx.org/` - Main page
- `https://trade.qrdx.org/api/health` - API health (if applicable)

## Security Considerations

1. **HTTPS**: Always use HTTPS in production
2. **Headers**: Set security headers (CSP, HSTS, etc.)
3. **Environment Variables**: Never commit secrets
4. **Dependencies**: Regularly update dependencies

## Troubleshooting

### Build Failures

```bash
# Clean install
pnpm clean
pnpm install

# Check for type errors
pnpm lint
```

### Runtime Errors

- Check browser console for errors
- Verify environment variables are set
- Check API connectivity
- Review server logs

## Post-Deployment Checklist

- [ ] Verify site loads correctly
- [ ] Test dark/light mode toggle
- [ ] Check mobile responsiveness
- [ ] Test wallet connection (when implemented)
- [ ] Verify navigation links work
- [ ] Check external links to qrdx.org
- [ ] Test on multiple browsers
- [ ] Verify SSL certificate
- [ ] Check page load performance
- [ ] Monitor error rates

## Support

For deployment issues:
- Check [Next.js deployment docs](https://nextjs.org/docs/deployment)
- Review hosting platform documentation
- Contact QRDX DevOps team

## Links

- Production: https://trade.qrdx.org
- Staging: https://trade-staging.qrdx.org (if applicable)
- Documentation: https://docs.qrdx.org
