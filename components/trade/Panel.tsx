import { cn } from '@/lib/utils'

/** A terminal panel: a card on the canvas, square on phones. */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden border-b bg-card lg:rounded-lg lg:border', className)} {...rest}>
      {children}
    </section>
  )
}

/** A panel's tab strip. */
export function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
  right,
  className,
}: {
  tabs: { id: T; label: React.ReactNode }[]
  value: T
  onChange: (id: T) => void
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex h-10 shrink-0 items-center gap-0.5 border-b px-2', className)}>
      <div className="flex h-full items-center gap-0.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative flex h-full items-center whitespace-nowrap px-2.5 text-[13px] font-medium transition-colors',
              t.id === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.id === value && <span className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
      {right && <div className="ml-auto flex items-center gap-1">{right}</div>}
    </div>
  )
}
