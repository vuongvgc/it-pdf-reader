import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Search, Tag } from 'lucide-react'
import { db, type Book } from '../db'
import { importPdf } from '../services/pdfService'

export default function Library({ onOpen }: { onOpen: (b: Book) => void }) {
  const books = useLiveQuery(() => db.books.orderBy('lastOpenedAt').reverse().toArray(), []) ?? []
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const addFiles = async (files: FileList | File[]) => {
    setBusy(true)
    for (const f of Array.from(files)) {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') continue
      try {
        await importPdf(f)
      } catch (e) {
        alert(`Không đọc được ${f.name}`)
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

  const editTags = async (b: Book) => {
    const v = prompt('Tags (cách nhau bằng dấu phẩy):', b.tags.join(', '))
    if (v !== null)
      await db.books.update(b.id, { tags: v.split(',').map((t) => t.trim()).filter(Boolean) })
  }
  const remove = async (b: Book) => {
    if (!confirm(`Xoá "${b.title}" cùng highlight & từ vựng liên quan?`)) return
    await db.transaction('rw', db.books, db.bookFiles, db.annotations, db.vocabularies, async () => {
      await db.books.delete(b.id)
      await db.bookFiles.delete(b.id)
      await db.annotations.where('bookId').equals(b.id).delete()
      await db.vocabularies.where('bookId').equals(b.id).delete()
    })
  }

  return (
    <div
      className={'p-4 ' + (drag ? 'outline outline-2 outline-dashed outline-sky-400' : '')}
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[10rem] flex-1 items-center gap-2 rounded bg-slate-800 px-2">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm sách…"
            className="w-full bg-transparent py-2 outline-none"
          />
        </div>
        <button className="btn !py-2" onClick={() => input.current?.click()} disabled={busy}>
          <Plus size={16} /> {busy ? 'Đang nhập…' : 'Thêm PDF'}
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
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {['', ...allTags].map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={'rounded-full px-3 py-1 ' + (tag === t ? 'bg-sky-500 text-slate-900' : 'bg-slate-800')}
            >
              {t || 'Tất cả'}
            </button>
          ))}
        </div>
      )}
      {!books.length && (
        <div className="mt-20 text-center text-slate-400">
          Kéo thả file PDF vào đây hoặc bấm “Thêm PDF” để bắt đầu.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((b) => (
          <div key={b.id} className="group relative">
            <button onClick={() => onOpen(b)} className="block w-full text-left">
              <img src={b.coverDataUrl} className="aspect-[3/4] w-full rounded bg-white object-cover shadow" />
              <div className="mt-1 line-clamp-2 text-sm font-medium">{b.title}</div>
              <div className="mt-1 h-1 rounded bg-slate-700">
                <div
                  className="h-1 rounded bg-sky-400"
                  style={{ width: `${(b.currentPage / b.totalPages) * 100}%` }}
                />
              </div>
              <div className="text-xs text-slate-400">
                {Math.round((b.currentPage / b.totalPages) * 100)}% · {b.totalPages} trang
              </div>
            </button>
            <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex max-md:flex">
              <button className="btn" onClick={() => editTags(b)}><Tag size={12} /></button>
              <button className="btn" onClick={() => remove(b)}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
