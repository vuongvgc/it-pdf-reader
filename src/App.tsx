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
    { t: 'library', label: 'Thư viện', icon: <LibIcon size={20} /> },
    { t: 'vocab', label: 'Từ vựng', icon: <BrainCircuit size={20} /> },
    { t: 'settings', label: 'Cài đặt', icon: <Cog size={20} /> },
  ]

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-900 text-slate-100">
      <main className="flex-1 pb-20">
        {tab === 'library' && <Library onOpen={setBook} />}
        {tab === 'vocab' && <Vocab />}
        {tab === 'settings' && <Settings />}
      </main>

      {/* Modern Bottom Navigation with iOS/iPad safe area */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-slate-800 bg-slate-900/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md shadow-2xl">
        {tabs.map(({ t, label, icon }) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-all touch-manipulation select-none ' +
              (tab === t
                ? 'text-sky-400 font-bold bg-slate-800/60'
                : 'text-slate-400 hover:text-slate-200 active:scale-95')
            }
          >
            {icon}
            <span className="text-[11px] leading-tight">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
