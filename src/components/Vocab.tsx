import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Volume2, Download, Upload, Trash2, Sparkles, Search, RotateCcw } from 'lucide-react'
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
        <b className="text-sky-300 font-bold">{ctx.slice(i, i + w.length)}</b>
        {ctx.slice(i + w.length)}
      </>
    )
  }

  const grade = async (g: Grade) => {
    if (!card) return
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
    <div className="safe-top pb-24 mx-auto max-w-2xl p-4 sm:p-6">
      {notice && (
        <div className="mb-4 rounded-xl bg-emerald-950/80 border border-emerald-500/50 p-3.5 text-sm text-emerald-200 shadow-lg animate-in fade-in">
          {notice}
        </div>
      )}

      {/* Starter Deck banner */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-sky-950/70 to-indigo-950/70 border border-sky-800/50 p-4 text-sm shadow-md">
        <div>
          <div className="font-bold text-sky-200 flex items-center gap-1.5 text-base">
            <Sparkles size={17} className="text-amber-400" /> Bộ từ vựng: Head First Software Architecture
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            29 thẻ thuật ngữ kiến trúc phần mềm cốt lõi (Trade-offs, Coupling, EDA, Microkernel, ADRs...)
          </div>
        </div>
        <button
          className="btn !min-h-[40px] !bg-sky-600 hover:!bg-sky-500 text-white font-medium"
          onClick={loadStarterDeck}
          disabled={loadingDeck}
        >
          {loadingDeck ? 'Đang nạp...' : '⚡ Nạp vào sổ tay'}
        </button>
      </div>

      {/* Mode & Action Bar with touch-friendly heights */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700">
          <button
            className={
              'rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition touch-manipulation ' +
              (mode === 'list' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200')
            }
            onClick={() => setMode('list')}
          >
            Danh sách ({list.length})
          </button>
          <button
            className={
              'rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition touch-manipulation ' +
              (mode === 'review' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200')
            }
            onClick={() => {
              setMode('review')
              setFlip(false)
            }}
          >
            Ôn tập ({due.length})
          </button>
        </div>

        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          className="rounded-xl bg-slate-800 px-3 py-2 text-xs sm:text-sm border border-slate-700 text-slate-200 outline-none"
        >
          <option value="">Tất cả nguồn</option>
          <option value="head-first-software-architecture">Head First Software Architecture</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>{b.title}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn !py-1.5 !px-2.5 text-xs" onClick={() => csvInput.current?.click()} title="Nhập từ file CSV">
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
            className="btn !py-1.5 !px-2.5 text-xs"
            onClick={() => download('vocab.csv', vocabToCsv(list), 'text/csv')}
            title="Xuất sang file CSV để học trên Anki"
          >
            <Download size={14} /> Anki CSV
          </button>
        </div>
      </div>

      {mode === 'list' && (
        <>
          <div className="mb-3.5 flex items-center gap-2 rounded-xl bg-slate-800/90 px-3 py-2 border border-slate-700 shadow-sm">
            <Search size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm thuật ngữ hoặc định nghĩa…"
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {!list.length && (
            <div className="my-16 text-center text-slate-400">
              Chưa có từ vựng nào. Hãy bấm “⚡ Nạp vào sổ tay” ở trên hoặc bôi đen từ khi đọc sách để lưu!
            </div>
          )}

          {list.map((v) => (
            <div
              key={v.id}
              className="mb-3 rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 text-sm shadow-sm transition hover:border-slate-600"
            >
              <div className="flex items-center gap-2">
                <b className="text-sky-300 font-bold text-base">{v.word}</b>
                <span className="text-slate-400 text-xs font-mono">{v.phonetic}</span>
                <button
                  className="rounded-full p-1.5 hover:bg-slate-700 active:scale-95 text-slate-300 transition"
                  onClick={() => speak(v.word, rate)}
                  title="Nghe phát âm"
                >
                  <Volume2 size={16} />
                </button>
                <button
                  className="ml-auto text-slate-500 hover:text-rose-400 p-1.5 transition active:scale-90"
                  onClick={() => db.vocabularies.delete(v.id)}
                  title="Xoá thẻ này"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-1.5 whitespace-pre-wrap text-slate-200 leading-relaxed text-sm">
                {v.meaningVi}
              </div>
              {v.contextSentence && (
                <div className="mt-2.5 rounded-xl bg-slate-900/60 border border-slate-800 p-2.5 text-xs italic text-slate-400">
                  “{v.contextSentence}” <span className="not-italic text-slate-500 font-medium">— {title(v.bookId)}</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {mode === 'review' &&
        (card ? (
          <div
            onClick={() => !flip && setFlip(true)}
            className="group relative cursor-pointer rounded-3xl border-2 border-slate-700 bg-slate-800/95 p-6 sm:p-8 text-center shadow-2xl transition hover:border-sky-500/60 select-none animate-in zoom-in-95 duration-150"
          >
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-700/80 pb-2">
              <span>Nguồn: {title(card.bookId)}</span>
              <span className="text-sky-400 flex items-center gap-1">
                <RotateCcw size={13} /> {flip ? 'Đã lật thẻ' : 'Chạm để lật'}
              </span>
            </div>

            {/* Context Question (Front) */}
            <div className="my-6 text-lg sm:text-xl leading-relaxed text-slate-100 font-serif">
              “{boldWord(card.contextSentence || card.word, card.word)}”
            </div>

            {!flip ? (
              <div className="mt-8 flex flex-col items-center">
                <button
                  className="btn !min-h-[46px] !bg-sky-600 hover:!bg-sky-500 text-white font-bold !px-8 rounded-xl text-base shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFlip(true)
                  }}
                >
                  Hiện đáp án
                </button>
                <span className="text-xs text-slate-400 mt-2">
                  (Hoặc chạm vào bất kỳ đâu trên thẻ)
                </span>
              </div>
            ) : (
              <div
                className="mt-6 border-t-2 border-dashed border-slate-700 pt-5 text-left animate-in fade-in duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-extrabold text-sky-300">{card.word}</span>
                    {card.phonetic && <span className="text-sm text-slate-400 font-mono">{card.phonetic}</span>}
                  </div>
                  <button
                    className="icon-btn !min-h-[38px] !min-w-[38px]"
                    onClick={() => speak(card.word, rate)}
                    title="Nghe phát âm"
                  >
                    <Volume2 size={20} />
                  </button>
                </div>

                <div className="mb-6 whitespace-pre-wrap text-sm sm:text-base leading-relaxed text-slate-200 font-normal">
                  {card.meaningVi}
                </div>

                {/* Rating buttons for SM-2 Spaced Repetition (Thumb-friendly 44px+) */}
                <div className="border-t border-slate-700/80 pt-4">
                  <div className="text-xs text-slate-400 font-medium mb-2.5 text-center">
                    Bạn nhớ từ này ở mức độ nào?
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { label: 'Quên', hint: '< 1 phút', cls: '!bg-rose-950/80 hover:!bg-rose-900 border border-rose-800 text-rose-200' },
                      { label: 'Khó', hint: '1 ngày', cls: '!bg-amber-950/80 hover:!bg-amber-900 border border-amber-800 text-amber-200' },
                      { label: 'Tốt', hint: '3 ngày', cls: '!bg-sky-950/80 hover:!bg-sky-900 border border-sky-800 text-sky-200' },
                      { label: 'Dễ', hint: '7 ngày', cls: '!bg-emerald-950/80 hover:!bg-emerald-900 border border-emerald-800 text-emerald-200' },
                    ].map((btn, i) => (
                      <button
                        key={btn.label}
                        className={`btn !min-h-[50px] flex flex-col items-center justify-center rounded-xl font-bold py-1.5 px-2 ${btn.cls}`}
                        onClick={() => grade(i as Grade)}
                      >
                        <span className="text-sm">{btn.label}</span>
                        <span className="text-[10px] opacity-75 font-normal">{btn.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="my-20 flex flex-col items-center justify-center text-center p-8 rounded-3xl border border-dashed border-slate-700 bg-slate-800/40">
            <span className="text-4xl mb-3">🎉</span>
            <div className="text-lg font-bold text-slate-200">Hoàn thành bài ôn hôm nay!</div>
            <div className="text-sm text-slate-400 mt-1 max-w-sm">
              Bạn đã ôn hết tất cả các thẻ đến hạn. Hãy quay lại đọc sách hoặc kiểm tra danh sách từ vựng.
            </div>
            <button
              className="btn !min-h-[42px] mt-4 font-semibold"
              onClick={() => setMode('list')}
            >
              Xem danh sách ({list.length})
            </button>
          </div>
        ))}
    </div>
  )
}
