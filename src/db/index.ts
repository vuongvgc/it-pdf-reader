import Dexie, { type Table } from 'dexie'

export interface Book {
  id: string
  title: string
  author: string
  totalPages: number
  currentPage: number
  zoom: number // 0 = fit width, otherwise scale
  coverDataUrl: string
  tags: string[]
  lastOpenedAt: number
  createdAt: number
}
export interface BookFile {
  bookId: string
  data: Blob
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
} // percent of page
export type HColor = 'yellow' | 'green' | 'blue' | 'red'
export interface Annotation {
  id: string
  bookId: string
  pageNumber: number
  selectedText: string
  note: string
  color: HColor
  rects: Rect[]
  createdAt: number
}
export interface Vocab {
  id: string
  word: string
  phonetic: string
  meaningVi: string
  itExplanation: string
  contextSentence: string
  bookId: string
  pageNumber: number
  srsStage: number // repetitions
  intervalDays: number
  easeFactor: number
  nextReviewAt: number
  createdAt: number
}

class AppDB extends Dexie {
  books!: Table<Book, string>
  bookFiles!: Table<BookFile, string>
  annotations!: Table<Annotation, string>
  vocabularies!: Table<Vocab, string>
  constructor() {
    super('it-pdf-reader')
    this.version(1).stores({
      books: 'id, lastOpenedAt, createdAt',
      bookFiles: 'bookId',
      annotations: 'id, bookId, pageNumber',
      vocabularies: 'id, bookId, nextReviewAt, word',
    })
    this.version(2).stores({
      vocabularies: 'id, bookId, nextReviewAt, word, createdAt',
    })
  }
}
export const db = new AppDB()
export const uid = () => crypto.randomUUID()
