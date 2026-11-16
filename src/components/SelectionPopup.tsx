import { useEffect, useState } from 'react'
import { Volume2, Sparkles, BookmarkPlus, X, Highlighter } from 'lucide-react'
import { db, uid, type HColor, type Rect } from '../db'
import { lookupDictionary, lookupGlossary, speak, type DictResult } from '../services/dictionaryService'
import { explainIT } from '../services/aiService'
import { useSettings } from '../stores/useSettingsStore'
import { HL_COLORS } from './PageView'

export interface Sel {
  text: string
  context: string
  page: number
  rects: Rect[]
  anchor: { x: number; y: number }
}

export default function SelectionPopup({
  sel,
  bookId,
  bookTitle,
  onClose,
}: {
  sel: Sel
  bookId: string
  bookTitle: string
  onClose: () => void
}) {
  const ttsRate = useSettings((s) => s.ttsRate)
  const wordCount = sel.text.trim().split(/\s+/).length
  const isWord = wordCount === 1
  const isPhrase = wordCount <= 4
  const [gloss, setGloss] = useState<string | null>(null)
  const [dict, setDict] = useState<DictResult | null>(null)
  const [ai, setAi] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setGloss(null)
    setDict(null)
    setAi('')
    setMsg('')
    if (isPhrase) {
      lookupGlossary(sel.text).then(setGloss)
    }
    if (isWord) {
      lookupDictionary(sel.text).then(setDict)
    }
  }, [sel.text, isWord, isPhrase])

  const askAI = async () => {
    setAiLoading(true)
    try {
      setAi(await explainIT({ text: sel.text, context: sel.context, bookTitle }))
    } catch (e: any) {
      setAi('⚠ ' + e.message)
    }
    setAiLoading(false)
  }

  const saveVocab = async () => {
    await db.vocabularies.add({
      id: uid(),
      word: sel.text.trim(),
      phonetic: dict?.phonetic ?? '',
      meaningVi: ai || gloss || dict?.meanings.map((m) => m.def).join('; ') || '',
      itExplanation: gloss ?? '',
      contextSentence: sel.context,
      bookId,
      pageNumber: sel.page,
      srsStage: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      nextReviewAt: Date.now(),
      createdAt: Date.now(),
    })
    setMsg('Đã lưu vào sổ từ vựng ✓')
  }

  const highlight = async (color: HColor) => {
    await db.annotations.add({
      id: uid(),
      bookId,
      pageNumber: sel.page,
      selectedText: sel.text,
      note: '',
      color,
      rects: sel.rects,
      createdAt: Date.now(),
    })
    window.getSelection()?.removeAllRanges()
    onClose()
  }

  // desktop: float near selection; mobile: bottom sheet
  const style: React.CSSProperties =
    window.innerWidth >= 768
      ? {
          left: Math.min(Math.max(8, sel.anchor.x - 160), window.innerWidth - 336),
          top: Math.min(sel.anchor.y + 10, window.innerHeight - 340),
        }
      : {}

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={style}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-y-auto rounded-t-2xl border border-slate-600 bg-slate-800 p-3 text-sm shadow-2xl md:inset-x-auto md:bottom-auto md:w-80 md:rounded-xl"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="font-semibold text-sky-300 line-clamp-3">{sel.text}</div>
        <button onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {dict?.phonetic && <div className="text-slate-400">{dict.phonetic}</div>}
      {gloss && <div className="my-1 rounded bg-emerald-900/40 p-2">🧠 {gloss}</div>}
      {dict?.meanings.map((m, i) => (
        <div key={i} className="my-1 text-slate-300">
          <i className="text-slate-400">{m.pos}</i> – {m.def}
        </div>
      ))}
      {ai && <div className="my-2 whitespace-pre-wrap rounded bg-slate-700 p-2">{ai}</div>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn" onClick={() => speak(sel.text, ttsRate)}>
          <Volume2 size={14} /> Đọc
        </button>
        <button className="btn" onClick={askAI} disabled={aiLoading}>
          <Sparkles size={14} /> {aiLoading ? 'Đang hỏi…' : 'Giải thích IT'}
        </button>
        <button className="btn" onClick={saveVocab}>
          <BookmarkPlus size={14} /> Lưu từ
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Highlighter size={14} />
        {(Object.keys(HL_COLORS) as HColor[]).map((c) => (
          <button
            key={c}
            onClick={() => highlight(c)}
            className="h-6 w-6 rounded-full border border-slate-500"
            style={{ background: HL_COLORS[c].replace('0.4', '1') }}
          />
        ))}
      </div>
      {msg && <div className="mt-2 text-emerald-400">{msg}</div>}
    </div>
  )
}
