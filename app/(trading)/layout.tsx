import { AppNav } from '@/components/AppNav'
import { PageFooter } from '@/components/chrome/PageFooter'
import { StatusBar } from '@/components/chrome/StatusBar'
import { TickerBar } from '@/components/chrome/TickerBar'

/**
 * Every app page: nav and the featured ticker on top, the status bar at the
 * bottom, and the page scrolling between them. Trading terminals fill that space
 * exactly; content pages scroll and end with the site footer.
 */
export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppNav />
      <TickerBar />
      <main id="main" className="relative min-h-0 flex-1 overflow-y-auto">
        {children}
        <PageFooter />
      </main>
      <StatusBar />
    </div>
  )
}
