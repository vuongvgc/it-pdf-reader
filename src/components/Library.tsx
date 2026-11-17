import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Search, Tag, X, BookOpen, AlertTriangle } from 'lucide-react'
import { db, type Book } from '../db'
import { importPdf } from '../services/pdfService'

export default function Library({ onOpen }: { onOpen: (b: Book) => void }) {
  const books = useLiveQuery(() => db.books.orderBy('lastOpenedAt').reverse().toArray(), []) ?? []
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [deletingBook, setDeletingBook] = useState<Book | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const addFiles = async (files: FileList | File[]) => {
    setBusy(true)
    for (const f of Array.from(files)) {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') continue
      try {
        await importPdf(f)
      } catch (e) {
        alert(`Không đọc được file ${f.name}`)
      }
    }
    setBusy(false)
  }

  const allTags = [...new Set(books.flatMap((b) => b.tags))]
  const shown = books.filter(
    (b) =>
      (!tag || b.tags.includes(tag)) &&
      (b.title + b.author).toLowerCase().includes(q.toLowerCase()),
  )

  const openTagModal = (b: Book, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingBook(b)
    setTagDraft(b.tags.join(', '))
  }

  const saveTags = async () => {
    if (!editingBook) return
    const tags = tagDraft.split(',').map((t) => t.trim()).filter(Boolean)
    await db.books.update(editingBook.id, { tags })
    setEditingBook(null)
  }

  const confirmDelete = async () => {
    if (!deletingBook) return
    const bId = deletingBook.id
    await db.transaction('rw', db.books, db.bookFiles, db.annotations, db.vocabularies, async () => {
      await db.books.delete(bId)
      await db.bookFiles.delete(bId)
      await db.annotations.where('bookId').equals(bId).delete()
      await db.vocabularies.where('bookId').equals(bId).delete()
    })
    setDeletingBook(null)
  }

  return (
    <div
      className={'safe-top p-4 sm:p-6 max-w-7xl mx-auto ' + (drag ? 'outline outline-2 outline-dashed outline-sky-400' : '')}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      {/* Search & Upload Action Bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-1 shadow-sm">
          <Search size={18} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm kiếm sách hoặc tác giả…"
            className="w-full bg-transparent py-2 text-sm text-slate-100 outline-none placeholder-slate-400"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-200 p-1">
              <X size={16} />
            </button>
          )}
        </div>

        <button
          className="btn !min-h-[42px] !bg-sky-600 hover:!bg-sky-500 text-white font-medium !px-4"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          <Plus size={18} /> {busy ? 'Đang nạp PDF…' : 'Thêm sách PDF'}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Tags Filter Carousel */}
      {allTags.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
          {['', ...allTags].map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={
                'rounded-full px-3.5 py-1.5 font-medium transition touch-manipulation ' +
                (tag === t
                  ? 'bg-sky-500 text-slate-950 shadow-md font-semibold'
                  : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700')
              }
            >
              {t || 'Tất cả sách'}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!books.length && (
        <div className="my-24 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-slate-700 bg-slate-800/30">
          <BookOpen size={48} className="text-slate-500 mb-3" />
          <div className="text-lg font-semibold text-slate-300">Thư viện chưa có sách</div>
          <div className="text-sm text-slate-400 mt-1 max-w-sm">
            Kéo thả file PDF vào đây hoặc bấm “Thêm sách PDF” để bắt đầu đọc và tra từ chuyên ngành.
          </div>
          <button
            className="btn !min-h-[42px] !bg-sky-600 hover:!bg-sky-500 text-white font-medium mt-4 !px-5"
            onClick={() => input.current?.click()}
          >
            <Plus size={18} /> Chọn file PDF từ máy
          </button>
        </div>
      )}

      {/* Responsive Book Grid: 2 cols on mobile, 3-4 on iPad, 5-6 on Desktop */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {shown.map((b) => (
          <div
            key={b.id}
            className="group relative flex flex-col rounded-2xl border border-slate-800 bg-slate-800/60 p-2.5 shadow-md hover:border-slate-700 transition"
          >
            <button onClick={() => onOpen(b)} className="block w-full text-left flex-1">
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-slate-900 shadow">
                <img
                  src={b.coverDataUrl}
                  alt={b.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105 duration-200"
                />
              </div>
              <div className="mt-2 line-clamp-2 text-sm font-semibold text-slate-200 leading-snug">
                {b.title}
              </div>
              {b.author && <div className="text-xs text-slate-400 truncate mt-0.5">{b.author}</div>}

              {/* Progress bar */}
              <div className="mt-2 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-400 transition-all duration-300"
                  style={{ width: `${Math.max(2, (b.currentPage / b.totalPages) * 100)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>{Math.round((b.currentPage / b.totalPages) * 100)}%</span>
                <span>{b.totalPages} trang</span>
              </div>
            </button>

            {/* Quick action buttons (Comfortable touch targets for mobile/iPad) */}
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-700/60 pt-2 gap-1.5">
              <button
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-sky-300 py-1.5 px-2.5 rounded-lg bg-slate-800/80 border border-slate-700 min-h-[38px] active:scale-95 transition"
                onClick={(e) => openTagModal(b, e)}
                title="Gắn tag"
              >
                <Tag size={14} />
                <span className="truncate max-w-[4rem]">
                  {b.tags.length ? b.tags[0] : 'Tag'}
                </span>
              </button>

              <button
                className="icon-btn !min-h-[38px] !min-w-[38px] text-slate-400 hover:text-rose-400 bg-slate-800/80 border border-slate-700 active:scale-95 transition"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeletingBook(b)
                }}
                title="Xoá sách"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Edit Book Tags (Touch-friendly, no prompt) */}
      {editingBook && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-bold text-base text-sky-300">Gắn Tag phân loại</span>
              <button className="icon-btn !p-1.5" onClick={() => setEditingBook(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="text-xs text-slate-400 mb-2 truncate">Sách: {editingBook.title}</div>
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="Ví dụ: Backend, System Design, AI (cách nhau bởi dấu phẩy)"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
            {/* Tag suggestions */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {['System Design', 'Backend', 'Architecture', 'DevOps', 'DSA'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    const current = tagDraft.split(',').map((s) => s.trim()).filter(Boolean)
                    if (!current.includes(t)) {
                      setTagDraft([...current, t].join(', '))
                    }
                  }}
                  className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
                >
                  + {t}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={() => setEditingBook(null)}>Huỷ</button>
              <button className="btn !bg-sky-600 hover:!bg-sky-500 text-white font-medium" onClick={saveTags}>
                Lưu Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Book (Touch-friendly, no confirm) */}
      {deletingBook && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-900/60 bg-slate-900 p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-400 font-bold mb-2">
              <AlertTriangle size={20} /> Xác nhận xoá sách
            </div>
            <div className="text-sm text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xoá cuốn sách <b className="text-slate-100">“{deletingBook.title}”</b> không? Toàn bộ highlight, ghi chú và từ vựng gắn liền với sách sẽ bị gỡ bỏ.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" onClick={() => setDeletingBook(null)}>Giữ lại</button>
              <button
                className="btn !bg-rose-700 hover:!bg-rose-600 text-white font-medium"
                onClick={confirmDelete}
              >
                Xác nhận xoá
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
