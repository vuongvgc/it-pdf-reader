import { useEffect, useState } from 'react'
import { Volume2, Sparkles, BookmarkPlus, X, Highlighter, KeyRound } from 'lucide-react'
import { db, uid, type HColor, type Rect } from '../db'
import { lookupDictionary, lookupGlossary, speak, type DictResult } from '../services/dictionaryService'
import { explainIT, lookupAICache } from '../services/aiService'
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
  const { ttsRate, apiKey, aiProvider, set: setSettings } = useSettings()
  const wordCount = sel.text.trim().split(/\s+/).length
  const isWord = wordCount === 1
  const isPhrase = wordCount <= 4
  const [gloss, setGloss] = useState<string | null>(null)
  const [dict, setDict] = useState<DictResult | null>(null)
  const [ai, setAi] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [needKey, setNeedKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setGloss(null)
    setDict(null)
    setAi('')
    setFromCache(false)
    setNeedKey(false)
    setMsg('')
    if (isPhrase) {
      lookupGlossary(sel.text).then(setGloss)
      lookupAICache(sel.text).then((cached) => {
        if (cached) {
          setAi(cached)
          setFromCache(true)
        }
      })
    }
    if (isWord) {
      lookupDictionary(sel.text).then(setDict)
    }
  }, [sel.text, isWord, isPhrase])

  const askAI = async (forceRefresh = false) => {
    if (!apiKey.trim()) {
      setNeedKey(true)
      return
    }
    setAiLoading(true)
    setNeedKey(false)
    try {
      const res = await explainIT({ text: sel.text, context: sel.context, bookTitle, forceRefresh })
      setAi(res)
      setFromCache(false)
    } catch (e: any) {
      if (e.message === 'NO_API_KEY') {
        setNeedKey(true)
      } else {
        setAi('⚠ ' + e.message)
      }
    }
    setAiLoading(false)
  }

  const saveInlineKeyAndAsk = async () => {
    if (!keyDraft.trim()) return
    setSettings({ apiKey: keyDraft.trim() })
    setNeedKey(false)
    setAiLoading(true)
    try {
      const res = await explainIT({ text: sel.text, context: sel.context, bookTitle, forceRefresh: true })
      setAi(res)
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
    setTimeout(() => setMsg(''), 3000)
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

  const isTouchDevice =
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024)

  const desktopStyle: React.CSSProperties = !isTouchDevice
    ? {
        left: Math.min(Math.max(12, sel.anchor.x - 160), window.innerWidth - 360),
        top: Math.min(sel.anchor.y + 12, window.innerHeight - 380),
      }
    : {}

  return (
    <>
      {isTouchDevice && (
        <div
          className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[1px]"
          onClick={onClose}
          onTouchStart={onClose}
        />
      )}

      <div
        onMouseDown={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={desktopStyle}
        className={
          isTouchDevice
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[72vh] overflow-y-auto rounded-t-2xl border-t border-slate-700 bg-slate-900/95 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm shadow-2xl backdrop-blur-md transition-transform animate-in slide-in-from-bottom duration-200'
            : 'fixed z-40 w-[22rem] max-h-[68vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-3.5 text-sm shadow-2xl backdrop-blur-md'
        }
      >
        {isTouchDevice && (
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-600" />
        )}

        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="font-bold text-base text-sky-300 line-clamp-2">{sel.text}</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 active:scale-95 transition"
            title="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {dict?.phonetic && <div className="text-slate-400 text-xs mb-1">{dict.phonetic}</div>}

        {gloss && (
          <div className="my-2 rounded-xl bg-emerald-950/70 border border-emerald-500/40 p-2.5 text-emerald-200">
            <span className="font-semibold">🧠 Thuật ngữ IT:</span> {gloss}
          </div>
        )}

        {dict?.meanings.map((m, i) => (
          <div key={i} className="my-1.5 text-slate-300 text-xs leading-relaxed">
            <i className="text-sky-400 font-medium">{m.pos}</i> – {m.def}
          </div>
        ))}

        {ai && (
          <div className="my-2.5 whitespace-pre-wrap rounded-xl border border-amber-500/30 bg-slate-800/90 p-2.5 text-xs text-slate-200 leading-relaxed">
            {fromCache && (
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                ⚡ Từ điển AI đã lưu
              </div>
            )}
            {ai}
          </div>
        )}

        {/* Inline API Key Input if missing */}
        {needKey && (
          <div className="my-2.5 rounded-xl border border-amber-500/50 bg-slate-800 p-3 text-xs">
            <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-amber-300">
              <KeyRound size={14} /> Nhập nhanh {aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API Key:
            </div>
            <div className="flex gap-1.5">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Dán API Key (AIza... hoặc sk-...)"
                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
              />
              <button
                className="btn !bg-sky-600 hover:!bg-sky-500 text-white text-xs !py-1 !px-3"
                onClick={saveInlineKeyAndAsk}
              >
                Lưu & Hỏi
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn !min-h-[40px] flex-1 sm:flex-none"
            onClick={() => speak(sel.text, ttsRate)}
          >
            <Volume2 size={16} /> Đọc
          </button>
          <button
            className="btn !min-h-[40px] flex-1 sm:flex-none text-amber-300"
            onClick={() => askAI(fromCache)}
            disabled={aiLoading}
          >
            <Sparkles size={16} /> {aiLoading ? 'Đang hỏi…' : fromCache ? 'Hỏi lại AI' : 'Giải thích IT'}
          </button>
          <button
            className="btn !min-h-[40px] flex-1 sm:flex-none text-sky-300"
            onClick={saveVocab}
          >
            <BookmarkPlus size={16} /> Lưu từ
          </button>
        </div>

        {/* Highlight Swatches */}
        <div className="mt-3.5 flex items-center gap-3 border-t border-slate-700/80 pt-3">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Highlighter size={15} /> Highlight:
          </span>
          <div className="flex gap-2.5">
            {(Object.keys(HL_COLORS) as HColor[]).map((c) => (
              <button
                key={c}
                onClick={() => highlight(c)}
                className="h-9 w-9 rounded-full border-2 border-slate-400/80 shadow-md transition-transform active:scale-90 hover:scale-110"
                style={{ background: HL_COLORS[c].replace('0.4', '1') }}
                title={`Highlight màu ${c}`}
              />
            ))}
          </div>
        </div>

        {msg && <div className="mt-2 text-xs font-medium text-emerald-400">{msg}</div>}
      </div>
    </>
  )
}
