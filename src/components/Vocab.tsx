import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Volume2, Download, Upload, Trash2, Sparkles, Search } from 'lucide-react'
import { db, uid, type Vocab as VocabType } from '../db'
import { review, type Grade } from '../services/srsService'
import { speak } from '../services/dictionaryService'
import { download, vocabToCsv } from '../services/exportService'
import { useSettings } from '../stores/useSettingsStore'

export default function Vocab() {
  const all = useLiveQuery(() => db.vocabularies.orderBy('createdAt').reverse().toArray(), []) ?? []
  const books = useLiveQuery(() => db.books.toArray(), []) ?? []
  const rate = useSettings((s) => s.ttsRate)
  const [mode, setMode] = useState<'list' | 'review'>('list')
  const [flip, setFlip] = useState(false)
  const [bookId, setBookId] = useState('')
  const [search, setSearch] = useState('')
  const [loadingDeck, setLoadingDeck] = useState(false)
  const [notice, setNotice] = useState('')
  const csvInput = useRef<HTMLInputElement>(null)

  const list = all
    .filter((v) => !bookId || v.bookId === bookId)
    .filter(
      (v) =>
        !search ||
        v.word.toLowerCase().includes(search.toLowerCase()) ||
        v.meaningVi.toLowerCase().includes(search.toLowerCase()),
    )

  const due = list.filter((v) => v.nextReviewAt <= Date.now())
  const card = due[0]
  const title = (id: string) => {
    if (id === 'head-first-software-architecture') return 'Head First Software Architecture'
    return books.find((b) => b.id === id)?.title || 'Chung'
  }

  const boldWord = (ctx: string, w: string) => {
    const i = ctx.toLowerCase().indexOf(w.toLowerCase())
    if (i < 0) return ctx
    return (
      <>
        {ctx.slice(0, i)}
        <b className="text-sky-300">{ctx.slice(i, i + w.length)}</b>
        {ctx.slice(i + w.length)}
      </>
    )
  }

  const grade = async (g: Grade) => {
    await db.vocabularies.update(card.id, review(card, g))
    setFlip(false)
  }

  // Load starter deck from Head First Software Architecture
  const loadStarterDeck = async () => {
    setLoadingDeck(true)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}head-first-software-architecture-deck.json`)
      const items: Array<{
        word: string
        phonetic: string
        meaningVi: string
        itExplanation: string
        contextSentence: string
      }> = await res.json()

      const existingWords = new Set((await db.vocabularies.toArray()).map((v) => v.word.toLowerCase()))
      let added = 0

      for (const item of items) {
        if (!existingWords.has(item.word.toLowerCase())) {
          await db.vocabularies.add({
            id: uid(),
            word: item.word,
            phonetic: item.phonetic,
            meaningVi: `${item.meaningVi}\n💡 ${item.itExplanation}`,
            itExplanation: item.itExplanation,
            contextSentence: item.contextSentence,
            bookId: 'head-first-software-architecture',
            pageNumber: 1,
            srsStage: 0,
            intervalDays: 0,
            easeFactor: 2.5,
            nextReviewAt: Date.now(),
            createdAt: Date.now() + added,
          })
          added++
        }
      }

      setNotice(
        added > 0
          ? `✓ Đã nạp thành công ${added} thẻ từ vựng 'Head First Software Architecture'!`
          : 'Bộ từ vựng này đã có sẵn trong danh sách của bạn.',
      )
    } catch (e: any) {
      setNotice('⚠ Lỗi nạp bộ từ: ' + e.message)
    }
    setLoadingDeck(false)
    setTimeout(() => setNotice(''), 4000)
  }

  // Import custom CSV
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    let count = 0

    const startIndex = lines[0].toLowerCase().includes('front') || lines[0].toLowerCase().includes('word') ? 1 : 0
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.replace(/^"|"$/g, '').trim())
      if (!parts[0]) continue
      await db.vocabularies.add({
        id: uid(),
        word: parts[0],
        phonetic: parts[1] || '',
        meaningVi: parts[2] || '',
        itExplanation: parts[3] || '',
        contextSentence: parts[4] || '',
        bookId: bookId || 'imported',
        pageNumber: 1,
        srsStage: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        nextReviewAt: Date.now(),
        createdAt: Date.now() + count,
      })
      count++
    }
    setNotice(`✓ Đã nhập thành công ${count} từ vựng từ CSV!`)
    setTimeout(() => setNotice(''), 4000)
    if (csvInput.current) csvInput.current.value = ''
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      {notice && (
        <div className="mb-4 rounded-lg bg-emerald-950/80 border border-emerald-500/50 p-3 text-sm text-emerald-200 shadow-lg">
          {notice}
        </div>
      )}

      {/* Starter Deck banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-800/50 p-3.5 text-sm">
        <div>
          <div className="font-semibold text-sky-200 flex items-center gap-1.5">
            <Sparkles size={16} className="text-amber-400" /> Bộ từ vựng: Head First Software Architecture
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            29 thẻ thuật ngữ kiến trúc phần mềm cốt lõi (Trade-offs, Coupling, EDA, Microkernel, ADRs...)
          </div>
        </div>
        <button
          className="btn !bg-sky-600 hover:!bg-sky-500 text-white font-medium"
          onClick={loadStarterDeck}
          disabled={loadingDeck}
        >
          {loadingDeck ? 'Đang nạp...' : '⚡ Nạp vào sổ tay'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className={'btn ' + (mode === 'list' ? 'ring-1 ring-sky-400' : '')} onClick={() => setMode('list')}>
          Danh sách ({list.length})
        </button>
        <button className={'btn ' + (mode === 'review' ? 'ring-1 ring-sky-400' : '')} onClick={() => setMode('review')}>
          Ôn tập ({due.length})
        </button>
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          className="rounded bg-slate-800 px-2 py-1 text-sm border border-slate-700"
        >
          <option value="">Tất cả nguồn</option>
          <option value="head-first-software-architecture">Head First Software Architecture</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>{b.title}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn" onClick={() => csvInput.current?.click()} title="Nhập từ file CSV">
            <Upload size={14} /> Nhập CSV
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={handleCsvImport}
          />
          <button
            className="btn"
            onClick={() => download('vocab.csv', vocabToCsv(list), 'text/csv')}
            title="Xuất sang file CSV để học trên Anki"
          >
            <Download size={14} /> CSV (Anki)
          </button>
        </div>
      </div>

      {mode === 'list' && (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-800/80 px-2.5 py-1.5 border border-slate-700">
            <Search size={15} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm thuật ngữ hoặc nghĩa..."
              className="w-full bg-transparent text-sm outline-none placeholder-slate-500"
            />
          </div>

          {!list.length && (
            <div className="my-10 text-center text-slate-400">
              Chưa có từ vựng nào. Hãy bấm “⚡ Nạp vào sổ tay” ở trên hoặc bôi đen từ khi đọc sách để lưu!
            </div>
          )}

          {list.map((v) => (
            <div key={v.id} className="mb-2.5 rounded-xl border border-slate-700/60 bg-slate-800/70 p-3.5 text-sm shadow-sm transition hover:border-slate-600">
              <div className="flex items-center gap-2">
                <b className="text-sky-300 font-semibold">{v.word}</b>
                <span className="text-slate-400 text-xs">{v.phonetic}</span>
                <button
                  className="rounded p-1 hover:bg-slate-700 text-slate-300 transition"
                  onClick={() => speak(v.word, rate)}
                  title="Nghe phát âm"
                >
                  <Volume2 size={15} />
                </button>
                <button
                  className="ml-auto text-slate-500 hover:text-red-400 p-1 transition"
                  onClick={() => db.vocabularies.delete(v.id)}
                  title="Xoá thẻ này"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-slate-200 leading-relaxed">{v.meaningVi}</div>
              {v.contextSentence && (
                <div className="mt-2 rounded bg-slate-900/60 border border-slate-800 p-2 text-xs italic text-slate-400">
                  “{v.contextSentence}” <span className="not-italic text-slate-500">— {title(v.bookId)}</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {mode === 'review' &&
        (card ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-800/90 p-6 text-center shadow-2xl">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Ngữ cảnh trong sách ({title(card.bookId)})
            </div>
            <div className="mb-6 text-lg leading-relaxed text-slate-200">
              {boldWord(card.contextSentence || card.word, card.word)}
            </div>
            {!flip ? (
              <button
                className="btn !bg-sky-600 hover:!bg-sky-500 text-white font-medium !py-2.5 !px-6 rounded-lg text-base shadow"
                onClick={() => setFlip(true)}
              >
                Hiện đáp án
              </button>
            ) : (
              <div className="mt-4 border-t border-slate-700/80 pt-4 text-left">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-2xl font-bold text-sky-300">{card.word}</span>
                  <button
                    className="btn !p-1.5"
                    onClick={() => speak(card.word, rate)}
                    title="Nghe phát âm"
                  >
                    <Volume2 size={18} />
                  </button>
                </div>
                {card.phonetic && <div className="text-xs text-slate-400 mb-2">{card.phonetic}</div>}
                <div className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                  {card.meaningVi}
                </div>
                <div className="flex justify-center gap-2">
                  {(['Quên', 'Khó', 'Tốt', 'Dễ'] as const).map((l, i) => (
                    <button
                      key={l}
                      className={
                        'btn !py-2 !px-4 font-medium ' +
                        (i === 0
                          ? '!bg-rose-900/60 hover:!bg-rose-800 text-rose-200'
                          : i === 1
                            ? '!bg-amber-900/60 hover:!bg-amber-800 text-amber-200'
                            : i === 2
                              ? '!bg-sky-900/60 hover:!bg-sky-800 text-sky-200'
                              : '!bg-emerald-900/60 hover:!bg-emerald-800 text-emerald-200')
                      }
                      onClick={() => grade(i as Grade)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-10 text-center text-slate-400">🎉 Tuyệt vời! Bạn đã hoàn thành tất cả các thẻ cần ôn hôm nay.</div>
        ))}
    </div>
  )
}
