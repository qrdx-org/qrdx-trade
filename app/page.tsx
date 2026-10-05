import { redirect } from 'next/navigation'

/** The app opens on the markets list. */
export default function Home() {
  redirect('/trade')
}
