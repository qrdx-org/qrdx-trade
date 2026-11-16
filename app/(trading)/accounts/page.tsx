import type { Metadata } from 'next'
import { AccountsView } from '@/components/accounts/AccountsView'

export const metadata: Metadata = { title: 'Accounts · QRDX Trade' }

export default function AccountsPage() {
  return <AccountsView />
}
