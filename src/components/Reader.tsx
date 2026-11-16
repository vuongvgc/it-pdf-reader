import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, ZoomIn, ZoomOut, List, Search, Highlighter, Sun, Moon, Coffee, Download,
} from 'lucide-react'
import { db, type Annotation, type Book, type Rect } from '../db'
import { getOutline, loadPdf, searchText, type OutlineItem, type PDFDoc } from '../services/pdfService'
import { annotationsToMarkdown, download } from '../services/exportService'
import { useSettings, type Theme } from '../stores/useSettingsStore'
import PageView from './PageView'
import SelectionPopup, { type Sel } from './SelectionPopup'

function sentenceAround(full: string, sel: string) {
  const i = full.indexOf(sel)
  if (i < 0) return sel
  const before = full.slice(0, i)
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '))
  const after = full.slice(i + sel.length)
  const m = after.search(/[.?!](\s|$)/)
  const end = m < 0 ? full.length : i + sel.length + m + 1
  return full.slice(start < 0 ? 0 : start + 2, end).trim()
}

type Panel = null | 'outline' | 'search' | 'notes'

export default function Reader({ book, onBack }: { book: Book; onBack: () => void }) {
  const { theme, set } = useSettings()
  const [doc, setDoc] = useState<PDFDoc | null>(null)
  const [base, setBase] = useState({ w: 600, h: 800 })
  const [zoom, setZoom] = useState(book.zoom) // 0 = fit width
  const [fitScale, setFitScale] = useState(1)
  const [page, setPage] = useState(book.currentPage)
  const [panel, setPanel] = useState<Panel>(null)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [sel, setSel] = useState<Sel | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ page: number; snippet: string }[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(page)
  const annotations = useLiveQuery(() => db.annotations.where('bookId').equals(book.id).toArray(), [book.id]) ?? []

  useEffect(() => {
    let d: PDFDoc
    ;(async () => {
      const f = await db.bookFiles.get(book.id)
      if (!f) return
      d = await loadPdf(f.data)
      const p = await d.getPage(1)
      const v = p.getViewport({ scale: 1 })
      setBase({ w: v.width, h: v.height })
      setDoc(d)
      getOutline(d).then(setOutline)
      db.books.update(book.id, { lastOpenedAt: Date.now() })
    })()
    return () => {
      d?.destroy()
    }
  }, [book.id])

  // fit width scale
  useEffect(() => {
    const calc = () => {
      const w = (scrollRef.current?.clientWidth ?? window.innerWidth) - 16
      setFitScale(Math.max(0.3, w / base.w))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [base.w, panel])

  const scale = zoom === 0 ? fitScale : zoom

  const goTo = useCallback((p: number, smooth = false) => {
    scrollRef.current
      ?.querySelector(`[data-page="${p}"]`)
      ?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // restore position on open + after zoom changes
  useEffect(() => {
    if (!doc) return
    const t = setTimeout(() => goTo(pageRef.current), 50)
    return () => clearTimeout(t)
  }, [doc, scale, goTo])

  const onVisible = useCallback(
    (p: number) => {
      pageRef.current = p
      setPage(p)
    },
    [],
  )
  useEffect(() => {
    if (!doc) return
    const t = setTimeout(() => db.books.update(book.id, { currentPage: page, zoom }), 400)
    return () => clearTimeout(t)
  }, [page, zoom, doc, book.id])

  // selection engine
  useEffect(() => {
    let timer: number
    const handle = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        const s = window.getSelection()
        const text = s?.toString().trim() ?? ''
        if (!s || !text || s.rangeCount === 0) return
        const range = s.getRangeAt(0)
        const el = (range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement)?.closest('[data-page]') as HTMLElement | null
        if (!el) return
        const box = el.getBoundingClientRect()
        const rects: Rect[] = Array.from(range.getClientRects())
          .filter((r) => r.width > 1 && r.height > 1)
          .map((r) => ({
            x: ((r.left - box.left) / box.width) * 100,
            y: ((r.top - box.top) / box.height) * 100,
            w: (r.width / box.width) * 100,
            h: (r.height / box.height) * 100,
          }))
        const full = (el.querySelector('.textLayer')?.textContent ?? '').replace(/\s+/g, ' ')
        const last = range.getBoundingClientRect()
        setSel({
          text: text.replace(/\s+/g, ' '),
          context: sentenceAround(full, text.replace(/\s+/g, ' ')),
          page: Number(el.dataset.page),
          rects,
          anchor: { x: last.left + last.width / 2, y: last.bottom },
        })
      }, 250)
    }
    const root = scrollRef.current
    root?.addEventListener('mouseup', handle)
    root?.addEventListener('touchend', handle)
    return () => {
      root?.removeEventListener('mouseup', handle)
      root?.removeEventListener('touchend', handle)
      clearTimeout(timer)
    }
  }, [doc])

  const doSearch = async () => {
    if (!doc || !query.trim()) return
    setResults(await searchText(doc, query.trim()))
  }

  const pagesByAnn = useMemo(() => {
    const m = new Map<number, Annotation[]>()
    annotations.forEach((a) => m.set(a.pageNumber, [...(m.get(a.pageNumber) ?? []), a]))
    return m
  }, [annotations])

  const editNote = async (a: Annotation) => {
    const note = prompt('Ghi chú (để trống + OK để xoá ghi chú; Cancel để huỷ):', a.note)
    if (note !== null) await db.annotations.update(a.id, { note })
  }

  const themes: { t: Theme; icon: JSX.Element }[] = [
    { t: 'light', icon: <Sun size={16} /> },
    { t: 'sepia', icon: <Coffee size={16} /> },
    { t: 'dark', icon: <Moon size={16} /> },
  ]
  const bg = theme === 'dark' ? 'bg-slate-950' : theme === 'sepia' ? 'bg-amber-100' : 'bg-slate-300'

  const renderOutline = (items: OutlineItem[], depth = 0): JSX.Element[] =>
    items.flatMap((it, i) => [
      <button
        key={depth + '-' + i + it.title}
        className="block w-full truncate py-1 text-left hover:text-sky-300"
        style={{ paddingLeft: depth * 12 }}
        onClick={() => it.page && goTo(it.page)}
      >
        {it.title} {it.page && <span className="text-slate-500">· {it.page}</span>}
      </button>,
      ...renderOutline(it.items, depth + 1),
    ])

  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-700 bg-slate-800 p-2 text-sm">
        <button className="btn" onClick={onBack}><ArrowLeft size={16} /></button>
        <div className="mx-1 min-w-0 flex-1 truncate font-medium">{book.title}</div>
        <input
          type="number"
          min={1}
          max={book.totalPages}
          value={page}
          onChange={(e) => goTo(Number(e.target.value))}
          className="w-16 rounded bg-slate-700 px-1 py-1 text-center"
        />
        <span className="text-slate-400">/ {book.totalPages}</span>
        <button className="btn" onClick={() => setZoom(Math.max(0.5, +(scale - 0.2).toFixed(2)))}><ZoomOut size={16} /></button>
        <button className="btn" onClick={() => setZoom(0)}>{Math.round(scale * 100)}%</button>
        <button className="btn" onClick={() => setZoom(Math.min(4, +(scale + 0.2).toFixed(2)))}><ZoomIn size={16} /></button>
        {themes.map(({ t, icon }) => (
          <button key={t} className={'btn ' + (theme === t ? 'ring-1 ring-sky-400' : '')} onClick={() => set({ theme: t })}>{icon}</button>
        ))}
        <button className="btn" onClick={() => setPanel(panel === 'outline' ? null : 'outline')}><List size={16} /></button>
        <button className="btn" onClick={() => setPanel(panel === 'search' ? null : 'search')}><Search size={16} /></button>
        <button className="btn" onClick={() => setPanel(panel === 'notes' ? null : 'notes')}><Highlighter size={16} /></button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {panel && (
          <aside className="absolute inset-y-0 left-0 z-30 w-72 max-w-[85vw] overflow-y-auto border-r border-slate-700 bg-slate-800 p-3 text-sm md:static">
            {panel === 'outline' &&
              (outline.length ? renderOutline(outline) : <div className="text-slate-400">PDF không có mục lục.</div>)}
            {panel === 'search' && (
              <>
                <div className="mb-2 flex gap-1">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                    placeholder="Tìm trong sách…"
                    className="min-w-0 flex-1 rounded bg-slate-700 px-2 py-1"
                  />
                  <button className="btn" onClick={doSearch}>Tìm</button>
                </div>
                {results.map((r, i) => (
                  <button key={i} onClick={() => goTo(r.page)} className="mb-2 block w-full text-left hover:text-sky-300">
                    <b>Tr. {r.page}</b>: <span className="text-slate-300">…{r.snippet}…</span>
                  </button>
                ))}
              </>
            )}
            {panel === 'notes' && (
              <>
                <button
                  className="btn mb-2"
                  onClick={() => download(`${book.title}.md`, annotationsToMarkdown(book.title, annotations), 'text/markdown')}
                >
                  <Download size={14} /> Xuất Markdown
                </button>
                {[...annotations].sort((a, b) => a.pageNumber - b.pageNumber).map((a) => (
                  <div key={a.id} className="mb-3 rounded bg-slate-700 p-2">
                    <button className="text-left" onClick={() => goTo(a.pageNumber)}>
                      <span className="text-slate-400">Tr. {a.pageNumber}</span> {a.selectedText}
                    </button>
                    {a.note && <div className="mt-1 text-amber-300">📝 {a.note}</div>}
                    <div className="mt-1 flex gap-2 text-xs">
                      <button onClick={() => editNote(a)}>Ghi chú</button>
                      <button onClick={() => db.annotations.delete(a.id)}>Xoá</button>
                    </div>
                  </div>
                ))}
                {!annotations.length && <div className="text-slate-400">Chưa có highlight.</div>}
              </>
            )}
          </aside>
        )}
        <div ref={scrollRef} className={`flex-1 overflow-auto p-2 ${bg}`}>
          {doc
            ? Array.from({ length: doc.numPages }, (_, i) => (
                <PageView
                  key={i + 1}
                  doc={doc}
                  pageNum={i + 1}
                  scale={scale}
                  baseSize={base}
                  theme={theme}
                  annotations={pagesByAnn.get(i + 1) ?? []}
                  onVisible={onVisible}
                  onAnnotationClick={editNote}
                />
              ))
            : <div className="p-8 text-center text-slate-400">Đang tải…</div>}
        </div>
      </div>
      {sel && (
        <SelectionPopup sel={sel} bookId={book.id} bookTitle={book.title} onClose={() => setSel(null)} />
      )}
    </div>
  )
}
