import { AppNav } from '@/components/AppNav'

/** Trade, perps, swap, pools and portfolio share the compact trading nav. */
export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      {children}
    </div>
  )
}
