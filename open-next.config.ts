import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * The OpenNext adapter's settings for Cloudflare Workers (https://opennext.js.org/cloudflare).
 * No incremental cache is configured: every page and API route here renders per request from
 * the node, and the API's own short caches live in the isolate (lib/server/cache.ts).
 */
export default defineCloudflareConfig({})
