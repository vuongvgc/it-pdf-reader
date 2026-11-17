import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, ZoomIn, ZoomOut, List, Search, Highlighter, Sun, Moon, Coffee, Download,
  Maximize2, Minimize2, Trash2, X, ChevronLeft, ChevronRight,
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
  const [showToolbar, setShowToolbar] = useState(true)
  const [editingAnn, setEditingAnn] = useState<Annotation | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(page)
  const annotations = useLiveQuery(() => db.annotations.where('bookId').equals(book.id).toArray(), [book.id]) ?? []

  // Load PDF Document
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

  // Fit width scale calculation (responsive for iPad / Mobile)
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
    if (p < 1 || !doc || p > doc.numPages) return
    scrollRef.current
      ?.querySelector(`[data-page="${p}"]`)
      ?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }, [doc])

  // Restore position on open + after zoom changes
  useEffect(() => {
    if (!doc) return
    const t = setTimeout(() => goTo(pageRef.current), 60)
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

  // Enhanced Selection Engine with selectionchange (debounced) for iPad/iOS touch handles
  useEffect(() => {
    let timer: number

    const handleSelection = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        const s = window.getSelection()
        const text = s?.toString().trim() ?? ''
        if (!s || !text || s.rangeCount === 0) {
          return
        }
        const range = s.getRangeAt(0)
        const ancestor = range.commonAncestorContainer
        const el = (ancestor instanceof Element ? ancestor : ancestor.parentElement)?.closest('[data-page]') as HTMLElement | null
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
    root?.addEventListener('mouseup', handleSelection)
    root?.addEventListener('touchend', handleSelection)
    document.addEventListener('selectionchange', handleSelection)

    return () => {
      root?.removeEventListener('mouseup', handleSelection)
      root?.removeEventListener('touchend', handleSelection)
      document.removeEventListener('selectionchange', handleSelection)
      clearTimeout(timer)
    }
  }, [doc])

  // Pinch-to-zoom gesture on touch devices
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let startDist = 0
    let startZoom = scale

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        startDist = Math.hypot(dx, dy)
        startZoom = scale
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const currentDist = Math.hypot(dx, dy)
        const factor = currentDist / startDist
        const newZoom = Math.min(3.5, Math.max(0.5, +(startZoom * factor).toFixed(2)))
        setZoom(newZoom)
      }
    }

    const onTouchEnd = () => {
      startDist = 0
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [scale])

  const doSearch = async () => {
    if (!doc || !query.trim()) return
    setResults(await searchText(doc, query.trim()))
  }

  const pagesByAnn = useMemo(() => {
    const m = new Map<number, Annotation[]>()
    annotations.forEach((a) => m.set(a.pageNumber, [...(m.get(a.pageNumber) ?? []), a]))
    return m
  }, [annotations])

  // Open In-App Note Modal
  const openNoteModal = (a: Annotation) => {
    setEditingAnn(a)
    setNoteDraft(a.note || '')
  }

  const saveNoteModal = async () => {
    if (!editingAnn) return
    await db.annotations.update(editingAnn.id, { note: noteDraft.trim() })
    setEditingAnn(null)
  }

  const deleteAnnotation = async () => {
    if (!editingAnn) return
    await db.annotations.delete(editingAnn.id)
    setEditingAnn(null)
  }

  const themes: { t: Theme; icon: JSX.Element; label: string }[] = [
    { t: 'light', icon: <Sun size={17} />, label: 'Sáng' },
    { t: 'sepia', icon: <Coffee size={17} />, label: 'Sepia' },
    { t: 'dark', icon: <Moon size={17} />, label: 'Tối' },
  ]
  const bg = theme === 'dark' ? 'bg-slate-950' : theme === 'sepia' ? 'bg-amber-100' : 'bg-slate-300'

  const renderOutline = (items: OutlineItem[], depth = 0): JSX.Element[] =>
    items.flatMap((it, i) => [
      <button
        key={depth + '-' + i + it.title}
        className="block w-full truncate py-2 px-2 text-left hover:text-sky-300 active:bg-slate-700/60 rounded text-sm transition"
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => {
          if (it.page) {
            goTo(it.page)
            if (window.innerWidth < 1024) setPanel(null)
          }
        }}
      >
        {it.title} {it.page && <span className="text-slate-400 font-normal">· Tr.{it.page}</span>}
      </button>,
      ...renderOutline(it.items, depth + 1),
    ])

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden select-none md:select-auto">
      {/* Top Navigation Toolbar with Safe-Area padding */}
      {showToolbar && (
        <header className="safe-top z-30 flex items-center justify-between gap-1.5 border-b border-slate-700 bg-slate-900/95 px-3 py-2 text-sm backdrop-blur-md transition-all shadow-md">
          {/* Left: Back & Title */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button className="icon-btn !min-h-[38px] !min-w-[38px]" onClick={onBack} title="Về thư viện">
              <ArrowLeft size={18} />
            </button>
            <div className="truncate font-semibold text-slate-100 max-w-[8rem] sm:max-w-xs md:max-w-md">
              {book.title}
            </div>
          </div>

          {/* Center: Page Jump on Tablet/Desktop */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              className="icon-btn !min-w-[34px] !p-1.5"
              onClick={() => goTo(page - 1)}
              disabled={page <= 1}
              title="Trang trước"
            >
              <ChevronLeft size={17} />
            </button>

            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-medium whitespace-nowrap">
              <input
                type="number"
                min={1}
                max={book.totalPages}
                value={page}
                onChange={(e) => goTo(Number(e.target.value))}
                className="w-10 bg-transparent text-center font-bold text-sky-400 outline-none"
              />
              <span className="text-slate-400">/ {book.totalPages}</span>
            </div>

            <button
              className="icon-btn !min-w-[34px] !p-1.5"
              onClick={() => goTo(page + 1)}
              disabled={page >= book.totalPages}
              title="Trang sau"
            >
              <ChevronRight size={17} />
            </button>

            {/* Desktop Zoom Controls */}
            <button
              className="icon-btn hidden md:inline-flex"
              onClick={() => setZoom(Math.max(0.5, +(scale - 0.2).toFixed(2)))}
              title="Thu nhỏ"
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="btn !px-2.5 !py-1 text-xs font-semibold"
              onClick={() => setZoom(0)}
              title="Vừa chiều ngang"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              className="icon-btn hidden md:inline-flex"
              onClick={() => setZoom(Math.min(3.5, +(scale + 0.2).toFixed(2)))}
              title="Phóng to"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          {/* Right: Theme Toggle & Panels (Compact & Touch Friendly) */}
          <div className="flex items-center gap-1">
            {/* Single cycle theme button on mobile */}
            <button
              className="icon-btn sm:hidden"
              onClick={() => {
                const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'sepia' : 'dark'
                set({ theme: nextTheme })
              }}
              title="Đổi màu nền đọc sách"
            >
              {theme === 'dark' ? <Moon size={17} /> : theme === 'sepia' ? <Coffee size={17} /> : <Sun size={17} />}
            </button>

            {/* Expanded themes on Tablet/Desktop */}
            <div className="hidden sm:flex items-center gap-0.5 rounded-lg bg-slate-800 p-0.5 border border-slate-700">
              {themes.map(({ t, icon, label }) => (
                <button
                  key={t}
                  className={
                    'rounded-md p-1.5 transition ' +
                    (theme === t ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200')
                  }
                  onClick={() => set({ theme: t })}
                  title={`Giao diện ${label}`}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Panel Buttons */}
            <button
              className={'icon-btn ' + (panel === 'outline' ? '!bg-sky-500 !text-slate-950' : '')}
              onClick={() => setPanel(panel === 'outline' ? null : 'outline')}
              title="Mục lục sách"
            >
              <List size={17} />
            </button>
            <button
              className={'icon-btn ' + (panel === 'search' ? '!bg-sky-500 !text-slate-950' : '')}
              onClick={() => setPanel(panel === 'search' ? null : 'search')}
              title="Tìm kiếm từ khóa"
            >
              <Search size={17} />
            </button>
            <button
              className={'icon-btn ' + (panel === 'notes' ? '!bg-sky-500 !text-slate-950' : '')}
              onClick={() => setPanel(panel === 'notes' ? null : 'notes')}
              title="Ghi chú & Highlight"
            >
              <Highlighter size={17} />
            </button>
            <button
              className="icon-btn text-slate-400 hidden sm:inline-flex"
              onClick={() => setShowToolbar(false)}
              title="Toàn màn hình đọc sách"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </header>
      )}

      {/* Main Body */}
      <div className="relative flex min-h-0 flex-1">
        {/* Backdrop for Mobile / Tablet Sidebar Drawer */}
        {panel && (
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setPanel(null)}
          />
        )}

        {/* Sidebar Drawer */}
        {panel && (
          <aside className="fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] flex flex-col border-r border-slate-700 bg-slate-900/95 p-4 text-sm shadow-2xl backdrop-blur-md lg:static lg:z-10 animate-in slide-in-from-left duration-200">
            <div className="mb-3 flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-base text-sky-300">
                {panel === 'outline' && 'Mục lục sách'}
                {panel === 'search' && 'Tìm kiếm'}
                {panel === 'notes' && 'Ghi chú & Highlight'}
              </span>
              <button className="icon-btn !min-h-[32px] !min-w-[32px] !p-1" onClick={() => setPanel(null)}>
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {panel === 'outline' &&
                (outline.length ? renderOutline(outline) : <div className="p-4 text-center text-slate-400">PDF này không có mục lục sẵn.</div>)}

              {panel === 'search' && (
                <>
                  <div className="mb-3 flex gap-1.5">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                      placeholder="Tìm từ khóa trong sách…"
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                    <button className="btn" onClick={doSearch}>Tìm</button>
                  </div>
                  {results.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        goTo(r.page)
                        if (window.innerWidth < 1024) setPanel(null)
                      }}
                      className="mb-2 block w-full rounded-lg border border-slate-800 bg-slate-800/60 p-2.5 text-left hover:border-sky-500/60 active:bg-slate-700 transition"
                    >
                      <b className="text-sky-300">Trang {r.page}</b>: <span className="text-slate-300 text-xs">…{r.snippet}…</span>
                    </button>
                  ))}
                </>
              )}

              {panel === 'notes' && (
                <>
                  <button
                    className="btn mb-3 w-full !bg-sky-600 hover:!bg-sky-500 text-white font-medium"
                    onClick={() => download(`${book.title}.md`, annotationsToMarkdown(book.title, annotations), 'text/markdown')}
                  >
                    <Download size={15} /> Xuất file Markdown (.md)
                  </button>
                  {[...annotations].sort((a, b) => a.pageNumber - b.pageNumber).map((a) => (
                    <div key={a.id} className="mb-3 rounded-xl border border-slate-800 bg-slate-800/70 p-3 shadow-sm">
                      <button
                        className="text-left w-full text-slate-200"
                        onClick={() => {
                          goTo(a.pageNumber)
                          if (window.innerWidth < 1024) setPanel(null)
                        }}
                      >
                        <span className="font-semibold text-sky-400 text-xs">Trang {a.pageNumber}:</span> “{a.selectedText}”
                      </button>
                      {a.note && <div className="mt-2 rounded bg-slate-900/60 p-2 text-xs text-amber-200 font-medium">📝 {a.note}</div>}
                      <div className="mt-2.5 flex items-center justify-end gap-2 text-xs border-t border-slate-800 pt-2">
                        <button className="btn !py-1 !px-2.5 text-xs" onClick={() => openNoteModal(a)}>Sửa ghi chú</button>
                        <button
                          className="btn !py-1 !px-2.5 text-xs text-rose-300 hover:text-rose-200"
                          onClick={() => db.annotations.delete(a.id)}
                        >
                          Xoá
                        </button>
                      </div>
                    </div>
                  ))}
                  {!annotations.length && <div className="p-6 text-center text-slate-400">Chưa có highlight hay ghi chú nào.</div>}
                </>
              )}
            </div>
          </aside>
        )}

        {/* PDF Document Virtualized Scroll Area */}
        <div
          ref={scrollRef}
          className={`flex-1 overflow-auto p-2 sm:p-4 ${bg} touch-pan-y`}
          onClick={() => {
            // Tap on background to toggle toolbar if no text selection
            const s = window.getSelection()
            if (!s || s.isCollapsed) {
              setShowToolbar((prev) => !prev)
            }
          }}
        >
          {doc ? (
            Array.from({ length: doc.numPages }, (_, i) => (
              <PageView
                key={i + 1}
                doc={doc}
                pageNum={i + 1}
                scale={scale}
                baseSize={base}
                theme={theme}
                annotations={pagesByAnn.get(i + 1) ?? []}
                onVisible={onVisible}
                onAnnotationClick={openNoteModal}
              />
            ))
          ) : (
            <div className="flex h-64 items-center justify-center text-slate-400">Đang tải tài liệu PDF…</div>
          )}
        </div>
      </div>

      {/* Bottom Floating Scrubber / Page Slider for iPad & Mobile */}
      {showToolbar && doc && (
        <div className="safe-bottom z-20 flex items-center gap-3 border-t border-slate-800 bg-slate-900/90 px-4 py-2 text-xs backdrop-blur-md shadow-lg">
          <span className="font-semibold text-slate-400 whitespace-nowrap">Tr. {page}</span>
          <input
            type="range"
            min={1}
            max={book.totalPages}
            value={page}
            onChange={(e) => goTo(Number(e.target.value))}
            className="w-full accent-sky-400 cursor-pointer h-2 bg-slate-700 rounded-lg"
          />
          <span className="text-slate-400 whitespace-nowrap">/ {book.totalPages}</span>
        </div>
      )}

      {/* Floating button to restore toolbar when hidden in immersive mode */}
      {!showToolbar && (
        <button
          className="icon-btn fixed bottom-4 right-4 z-20 !h-12 !w-12 !rounded-full bg-slate-800/90 border border-slate-600 shadow-2xl text-sky-400 active:scale-95"
          onClick={() => setShowToolbar(true)}
          title="Hiện thanh công cụ"
        >
          <Minimize2 size={20} />
        </button>
      )}

      {/* Selection Popup (Responsive Bottom Sheet / Popover) */}
      {sel && (
        <SelectionPopup sel={sel} bookId={book.id} bookTitle={book.title} onClose={() => setSel(null)} />
      )}

      {/* In-App Note Modal (Touch Friendly, No window.prompt) */}
      {editingAnn && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-bold text-base text-sky-300">Ghi chú cá nhân (Trang {editingAnn.pageNumber})</span>
              <button className="icon-btn !p-1.5" onClick={() => setEditingAnn(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 rounded-lg bg-slate-800/80 p-2.5 text-xs text-slate-300 italic border border-slate-700">
              “{editingAnn.selectedText}”
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Nhập ghi chú hoặc kiến thức bạn muốn lưu lại…"
              rows={4}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-100 outline-none focus:border-sky-500 leading-relaxed"
            />
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                className="btn !bg-rose-900/60 hover:!bg-rose-800 text-rose-200"
                onClick={deleteAnnotation}
              >
                <Trash2 size={16} /> Xoá highlight
              </button>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setEditingAnn(null)}>Huỷ</button>
                <button className="btn !bg-sky-600 hover:!bg-sky-500 text-white font-medium" onClick={saveNoteModal}>
                  Lưu ghi chú
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
