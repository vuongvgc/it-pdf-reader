import { db, type Annotation, type Vocab } from '../db'

export function download(name: string, content: BlobPart, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function annotationsToMarkdown(title: string, anns: Annotation[]) {
  const lines = [`# ${title}`, '']
  for (const a of [...anns].sort((x, y) => x.pageNumber - y.pageNumber)) {
    lines.push(`> ${a.selectedText.replace(/\n/g, ' ')}`, `— trang ${a.pageNumber}`)
    if (a.note) lines.push('', `**Ghi chú:** ${a.note}`)
    lines.push('')
  }
  return lines.join('\n')
}

export function vocabToCsv(list: Vocab[]) {
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`
  const rows = list.map((v) =>
    [v.word, v.phonetic, v.meaningVi, v.itExplanation, v.contextSentence].map(esc).join(','),
  )
  return ['Front,Phonetic,Meaning,IT,Context', ...rows].join('\n')
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.readAsDataURL(b)
  })

/** Backup metadata + annotations + vocab (+ optionally PDF files) as JSON */
export async function exportBackup(includeFiles: boolean) {
  const files = includeFiles
    ? await Promise.all(
        (await db.bookFiles.toArray()).map(async (f) => ({
          bookId: f.bookId,
          data: await blobToDataUrl(f.data),
        })),
      )
    : []
  const data = {
    version: 1,
    books: await db.books.toArray(),
    annotations: await db.annotations.toArray(),
    vocabularies: await db.vocabularies.toArray(),
    files,
  }
  download(`it-pdf-reader-backup-${Date.now()}.json`, JSON.stringify(data), 'application/json')
}

export async function importBackup(file: File) {
  const d = JSON.parse(await file.text())
  await db.transaction('rw', db.books, db.bookFiles, db.annotations, db.vocabularies, async () => {
    await db.books.bulkPut(d.books ?? [])
    await db.annotations.bulkPut(d.annotations ?? [])
    await db.vocabularies.bulkPut(d.vocabularies ?? [])
    for (const f of d.files ?? []) {
      const blob = await (await fetch(f.data)).blob()
      await db.bookFiles.put({ bookId: f.bookId, data: blob })
    }
  })
}
