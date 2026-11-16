import { useEffect, useState } from 'react'
import { Library as LibIcon, BrainCircuit, Settings as Cog } from 'lucide-react'
import type { Book } from './db'
import Library from './components/Library'
import Reader from './components/Reader'
import Vocab from './components/Vocab'
import Settings from './components/Settings'

type Tab = 'library' | 'vocab' | 'settings'

export default function App() {
  const [book, setBook] = useState<Book | null>(null)
  const [tab, setTab] = useState<Tab>('library')

  useEffect(() => {
    navigator.storage?.persist?.()
  }, [])

  if (book) return <Reader book={book} onBack={() => setBook(null)} />

  const tabs: { t: Tab; label: string; icon: JSX.Element }[] = [
    { t: 'library', label: 'Thư viện', icon: <LibIcon size={18} /> },
    { t: 'vocab', label: 'Từ vựng', icon: <BrainCircuit size={18} /> },
    { t: 'settings', label: 'Cài đặt', icon: <Cog size={18} /> },
  ]
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="flex-1 pb-16">
        {tab === 'library' && <Library onOpen={setBook} />}
        {tab === 'vocab' && <Vocab />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-slate-700 bg-slate-800 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ t, label, icon }) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ' + (tab === t ? 'text-sky-400' : 'text-slate-400')}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
