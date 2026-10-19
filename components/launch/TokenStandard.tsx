'use client'

import { useState } from 'react'
import { Plus, ShieldAlert, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { extensionSummary, untradableReason, type TokenExtensions } from '@/lib/launch'
import { cn } from '@/lib/utils'

/**
 * The token standard's options (qrdx-node docs/NATIVE_TOKENS.md §7), chosen when the token is
 * created: they cannot be added later. A plain token sets none of them.
 */
export function TokenStandard({ value, onChange, creator }: { value: TokenExtensions; onChange: (next: TokenExtensions) => void; creator: string | null }) {
  const set = (patch: Partial<TokenExtensions>) => onChange({ ...value, ...patch })
  const untradable = untradableReason(value)
  const powers = extensionSummary(value, creator)
  const fee = value.transferFeeBps.trim() !== ''
  // Open when it starts with options set; after that the reader opens and closes it.
  const [open, setOpen] = useState(() => powers.length > 0 || value.decimals !== 18)

  return (
    <details className="rounded-md border text-xs" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">
        Token standard options
        <span className="ml-1 font-normal text-muted-foreground">metadata, decimals, freeze, fees, soulbound, pause…</span>
      </summary>
      <div className="space-y-4 border-t px-3 py-3">
        <p className="text-[11px] text-muted-foreground">
          Chosen now, fixed for good: a token cannot gain these later. Buyers, wallets and the explorer see each one.
        </p>

        <Group title="Display">
          <Row label="Decimals" hint="How wallets show amounts. 18 is the usual; 6 for a dollar-like token, 0 for whole units.">
            <Input
              value={String(value.decimals)}
              onChange={(e) => set({ decimals: Math.min(18, Math.max(0, Number(e.target.value.replace(/\D/g, '') || 0))) })}
              inputMode="numeric"
              className="h-8 w-20 tabular"
              aria-label="Decimals"
            />
          </Row>
        </Group>

        <Group title="Metadata">
          <Row label="Metadata URI" hint="A JSON document (image, description, links), https:// or ipfs://. At most 256 characters.">
            <Input value={value.uri} onChange={(e) => set({ uri: e.target.value })} maxLength={256} placeholder="ipfs://…" className="h-8 font-mono text-xs" />
          </Row>
          <div className="space-y-1">
            {value.fields.map((f, i) => (
              <div key={i} className="flex gap-1">
                <Input
                  value={f.key}
                  onChange={(e) => set({ fields: value.fields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })}
                  maxLength={32}
                  placeholder="field"
                  className="h-8 w-28 text-xs"
                  aria-label="Field name"
                />
                <Input
                  value={f.value}
                  onChange={(e) => set({ fields: value.fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                  maxLength={256}
                  placeholder="value"
                  className="h-8 flex-1 text-xs"
                  aria-label="Field value"
                />
                <button type="button" onClick={() => set({ fields: value.fields.filter((_, j) => j !== i) })} aria-label="Remove field" className="rounded border px-2 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {value.fields.length < 16 && (
              <button type="button" onClick={() => set({ fields: [...value.fields, { key: '', value: '' }] })} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <Plus className="h-3 w-3" /> Add a field (website, description, …)
              </button>
            )}
          </div>
          <Toggle checked={!value.metadataEditable} onChange={(v) => set({ metadataEditable: !v })} label="Lock the metadata" hint="Nobody can ever change the name, ticker, URI or fields. Otherwise you can, later." />
        </Group>

        <Group title="Control">
          <Row label="Freeze authority" hint="May freeze a holder's balance so it cannot move. Buyers see a freezable token as riskier.">
            <Choice
              value={value.freeze}
              options={[
                ['none', 'Nobody'],
                ['self', 'Me'],
                ['other', 'Another address'],
              ]}
              onChange={(freeze) => set({ freeze, defaultFrozen: freeze === 'none' ? false : value.defaultFrozen })}
            />
            {value.freeze === 'other' && <Input value={value.freezeOther} onChange={(e) => set({ freezeOther: e.target.value })} placeholder="0xPQ… or 0x…" className="mt-1 h-8 font-mono text-xs" />}
          </Row>
          {value.freeze !== 'none' && (
            <Toggle checked={value.defaultFrozen} onChange={(defaultFrozen) => set({ defaultFrozen })} label="Every account starts frozen" hint="For permissioned assets: holders can receive but not move it until the freeze authority thaws them. You start thawed." />
          )}
          <Toggle checked={value.pausable} onChange={(pausable) => set({ pausable })} label="Pausable" hint="You can stop every transfer, mint and burn (pools and books included) and resume them." />
          <Row label="Permanent delegate" hint="May move or burn anyone's balance without an allowance: a regulated issuer's clawback. Leave empty for none.">
            <Input value={value.permanentDelegate} onChange={(e) => set({ permanentDelegate: e.target.value })} placeholder="0xPQ… or 0x… (optional)" className="h-8 font-mono text-xs" />
          </Row>
          <Row label="Default operators" hint="ERC-777: up to 8 addresses that may move every holder's balance until the holder revokes them. Comma-separated.">
            <Input value={value.defaultOperators} onChange={(e) => set({ defaultOperators: e.target.value })} placeholder="optional" className="h-8 font-mono text-xs" />
          </Row>
        </Group>

        <Group title="Transfers">
          <Toggle checked={value.nonTransferable} onChange={(nonTransferable) => set({ nonTransferable, transferFeeBps: nonTransferable ? '' : value.transferFeeBps })} label="Soulbound (non-transferable)" hint="Only minted and burned; holders can never send it. Badges, memberships, credentials." />
          {!value.nonTransferable && (
            <Row label="Transfer fee" hint="Basis points withheld from every holder-to-holder transfer for you to collect (100 = 1 %). Empty for none. A new rate can be set later and applies 100 blocks after.">
              <div className="flex gap-1">
                <Input value={value.transferFeeBps} onChange={(e) => set({ transferFeeBps: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="bps, e.g. 50" className="h-8 w-28 tabular" aria-label="Transfer fee in basis points" />
                {fee && <Input value={value.maxTransferFee} onChange={(e) => set({ maxTransferFee: e.target.value.trim() })} inputMode="decimal" placeholder="max fee per transfer (optional)" className="h-8 flex-1 tabular" aria-label="Maximum fee per transfer" />}
              </div>
            </Row>
          )}
        </Group>

        <Toggle
          checked={value.postDoomsdayTrade}
          onChange={(postDoomsdayTrade) => set({ postDoomsdayTrade })}
          label="Backed by locked classical assets"
          hint="Advisory flag (whitepaper §9.2): clients may keep trading the token after the Doomsday Protocol triggers. Set it only if that is true."
        />

        {(powers.length > 0 || untradable) && (
          <div className="space-y-1 rounded-md border border-warn/40 bg-warn/5 p-2">
            {powers.length > 0 && (
              <>
                <p className="flex items-center gap-1 font-medium">
                  <ShieldAlert className="h-3.5 w-3.5 text-warn" /> Buyers will see that:
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
                  {powers.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
            {untradable && <p className="text-[11px] text-warn">{untradable} It is created as a token only.</p>}
          </div>
        )}
      </div>
    </details>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-medium">{label}</div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={cn('rounded border py-1 text-xs', value === k ? 'border-primary bg-accent' : 'text-muted-foreground')}>
          {label}
        </button>
      ))}
    </div>
  )
}
