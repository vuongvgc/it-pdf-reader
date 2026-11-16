import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { db, uid, type Book } from '../db'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
export { pdfjs }
export type PDFDoc = pdfjs.PDFDocumentProxy

export async function loadPdf(blob: Blob): Promise<PDFDoc> {
  const data = new Uint8Array(await blob.arrayBuffer())
  return pdfjs.getDocument({ data }).promise
}

async function makeCover(doc: PDFDoc): Promise<string> {
  const page = await doc.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: 240 / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.6)
}

export async function importPdf(file: File): Promise<Book> {
  const doc = await loadPdf(file)
  const meta = await doc.getMetadata().catch(() => null)
  const info = (meta?.info ?? {}) as Record<string, string>
  const book: Book = {
    id: uid(),
    title: info.Title?.trim() || file.name.replace(/\.pdf$/i, ''),
    author: info.Author?.trim() || '',
    totalPages: doc.numPages,
    currentPage: 1,
    zoom: 0,
    coverDataUrl: await makeCover(doc),
    tags: [],
    lastOpenedAt: Date.now(),
    createdAt: Date.now(),
  }
  await db.transaction('rw', db.books, db.bookFiles, async () => {
    await db.books.add(book)
    await db.bookFiles.add({ bookId: book.id, data: file })
  })
  doc.destroy()
  return book
}

export interface OutlineItem {
  title: string
  page: number | null
  items: OutlineItem[]
}
export async function getOutline(doc: PDFDoc): Promise<OutlineItem[]> {
  const raw = await doc.getOutline()
  if (!raw) return []
  const walk = async (nodes: any[]): Promise<OutlineItem[]> =>
    Promise.all(
      nodes.map(async (n) => {
        let page: number | null = null
        try {
          const dest = typeof n.dest === 'string' ? await doc.getDestination(n.dest) : n.dest
          if (dest) page = (await doc.getPageIndex(dest[0])) + 1
        } catch {
          /* ignore */
        }
        return { title: n.title as string, page, items: await walk(n.items ?? []) }
      }),
    )
  return walk(raw)
}

export async function searchText(doc: PDFDoc, q: string, limit = 50) {
  const results: { page: number; snippet: string }[] = []
  const needle = q.toLowerCase()
  for (let p = 1; p <= doc.numPages && results.length < limit; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const text = tc.items.map((i: any) => i.str).join(' ')
    const idx = text.toLowerCase().indexOf(needle)
    if (idx >= 0) {
      results.push({
        page: p,
        snippet: text.slice(Math.max(0, idx - 40), idx + q.length + 60),
      })
    }
  }
  return results
}
