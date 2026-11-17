import { useEffect, useState } from 'react'
import { Library as LibIcon, BrainCircuit, Settings as Cog } from 'lucide-react'
import { db, type Book } from './db'
import Library from './components/Library'
import Reader from './components/Reader'
import Vocab from './components/Vocab'
import Settings from './components/Settings'
import { applyQuickSetupFromHash, syncWithGist } from './services/syncService'
import { useSettings } from './stores/useSettingsStore'

type Tab = 'library' | 'vocab' | 'settings'

export default function App() {
  const [bookId, setBookId] = useState<string | null>(null)
  const [activeBook, setActiveBook] = useState<Book | null>(null)
  const [tab, setTab] = useState<Tab>('library')
  const [toast, setToast] = useState('')

  useEffect(() => {
    navigator.storage?.persist?.()

    const importedSetup = applyQuickSetupFromHash()
    const { githubToken, autoSync } = useSettings.getState()

    if (importedSetup) {
      setToast('✓ Đã nạp cấu hình Key tự động! Đang đồng bộ dữ liệu…')
      if (useSettings.getState().githubToken) {
        syncWithGist()
          .then((r) =>
            setToast(`✓ Đã đồng bộ xong (${r.stats.vocabularies} từ vựng, ${r.stats.annotations} highlight)!`),
          )
          .catch((e) => setToast('⚠ ' + e.message))
          .finally(() => setTimeout(() => setToast(''), 4500))
      } else {
        setTimeout(() => setToast(''), 3500)
      }
    } else if (autoSync && githubToken.trim()) {
      syncWithGist().catch(() => {})
    }
  }, [])

  const openBook = async (b: Book) => {
    const fresh = (await db.books.get(b.id)) || b
    setActiveBook(fresh)
    setBookId(fresh.id)
  }

  if (bookId && activeBook) {
    return (
      <Reader
        book={activeBook}
        onBack={() => {
          setBookId(null)
          setActiveBook(null)
        }}
      />
    )
  }

  const tabs: { t: Tab; label: string; icon: JSX.Element }[] = [
    { t: 'library', label: 'Thư viện', icon: <LibIcon size={20} /> },
    { t: 'vocab', label: 'Từ vựng', icon: <BrainCircuit size={20} /> },
    { t: 'settings', label: 'Cài đặt & Sync', icon: <Cog size={20} /> },
  ]

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-900 text-slate-100">
      {toast && (
        <div className="fixed top-4 inset-x-4 z-50 mx-auto max-w-md rounded-xl border border-emerald-500/60 bg-emerald-950/95 p-3 text-center text-xs font-medium text-emerald-200 shadow-2xl">
          {toast}
        </div>
      )}

      <main className="flex-1 pb-20">
        {tab === 'library' && <Library onOpen={openBook} onGoSettings={() => setTab('settings')} />}
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
