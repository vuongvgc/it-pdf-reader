import { db, type Annotation, type Book, type Vocab, type AICacheItem } from '../db'
import { useSettings } from '../stores/useSettingsStore'

const SYNC_FILENAME = 'it-pdf-reader-sync.json'

interface SyncPayload {
  version: number
  updatedAt: number
  aiConfig?: {
    aiProvider: 'gemini' | 'openai'
    apiKey: string
  }
  books: Array<Omit<Book, 'coverDataUrl'> & { coverDataUrl?: string }>
  annotations: Annotation[]
  vocabularies: Vocab[]
  aiCache: AICacheItem[]
}

const bookIdentityKey = (b: { title: string; totalPages: number }) =>
  `${b.title.trim().toLowerCase()}__${b.totalPages}`

async function findExistingSyncGist(token: string): Promise<string | null> {
  const res = await fetch('https://api.github.com/gists?per_page=100', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API lỗi ${res.status}: Kiểm tra lại Personal Access Token (cần quyền 'gist').`)
  }
  const gists: any[] = await res.json()
  const found = gists.find((g) => g.files && g.files[SYNC_FILENAME])
  return found ? found.id : null
}

export async function syncWithGist(): Promise<{
  status: 'merged' | 'created'
  gistId: string
  stats: { books: number; annotations: number; vocabularies: number }
}> {
  const state = useSettings.getState()
  const token = state.githubToken.trim()
  if (!token) {
    throw new Error('Vui lòng nhập GitHub Personal Access Token (quyền gist) trong Cài đặt.')
  }

  let gistId = state.gistId.trim()
  if (!gistId) {
    gistId = (await findExistingSyncGist(token)) || ''
  }

  let remotePayload: SyncPayload | null = null

  if (gistId) {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    })
    if (res.ok) {
      const gistData = await res.json()
      const fileObj = gistData.files?.[SYNC_FILENAME]
      if (fileObj?.content) {
        try {
          remotePayload = JSON.parse(fileObj.content)
        } catch {
          remotePayload = null
        }
      }
    } else if (res.status === 404) {
      gistId = ''
    } else {
      throw new Error(`Không đọc được Gist (${res.status})`)
    }
  }

  // Merge remote data with local IndexedDB
  const localBooks = await db.books.toArray()
  const localAnns = await db.annotations.toArray()
  const localVocabs = await db.vocabularies.toArray()
  const localCache = await db.aiCache.toArray()

  // Map remote book IDs to local book IDs if same title + totalPages
  const remoteToLocalBookId = new Map<string, string>()
  const localByKey = new Map<string, Book>()
  for (const lb of localBooks) {
    localByKey.set(bookIdentityKey(lb), lb)
  }

  if (remotePayload) {
    // 1. Sync AI key if enabled and local has none (or remote has one)
    if (state.syncApiKey && remotePayload.aiConfig?.apiKey && !state.apiKey) {
      state.set({
        aiProvider: remotePayload.aiConfig.aiProvider || 'gemini',
        apiKey: remotePayload.aiConfig.apiKey,
      })
    }

    // 2. Merge Books progress & tags (only update books that exist locally or keep metadata)
    for (const rb of remotePayload.books ?? []) {
      const key = bookIdentityKey(rb)
      const lb = localByKey.get(key)
      if (lb) {
        remoteToLocalBookId.set(rb.id, lb.id)
        const mergedTags = Array.from(new Set([...(lb.tags || []), ...(rb.tags || [])]))
        const isRemoteNewer = (rb.lastOpenedAt || 0) > (lb.lastOpenedAt || 0)
        await db.books.update(lb.id, {
          currentPage: isRemoteNewer ? rb.currentPage : lb.currentPage,
          zoom: isRemoteNewer ? rb.zoom : lb.zoom,
          lastOpenedAt: Math.max(lb.lastOpenedAt || 0, rb.lastOpenedAt || 0),
          tags: mergedTags,
        })
      }
    }

    // 3. Merge Annotations
    const localAnnIds = new Set(localAnns.map((a) => a.id))
    for (const ra of remotePayload.annotations ?? []) {
      const mappedBookId = remoteToLocalBookId.get(ra.bookId) || ra.bookId
      if (!localAnnIds.has(ra.id)) {
        await db.annotations.put({ ...ra, bookId: mappedBookId })
      } else {
        const la = localAnns.find((x) => x.id === ra.id)
        if (la && ra.note && ra.note !== la.note) {
          await db.annotations.update(la.id, { note: ra.note })
        }
      }
    }

    // 4. Merge Vocabularies (match by id or lowercase word)
    const localVocabByWord = new Map<string, Vocab>()
    for (const lv of localVocabs) {
      localVocabByWord.set(lv.word.toLowerCase(), lv)
    }
    for (const rv of remotePayload.vocabularies ?? []) {
      const mappedBookId = remoteToLocalBookId.get(rv.bookId) || rv.bookId
      const existing = localVocabByWord.get(rv.word.toLowerCase())
      if (!existing) {
        await db.vocabularies.put({ ...rv, bookId: mappedBookId })
      } else if ((rv.srsStage || 0) > (existing.srsStage || 0)) {
        await db.vocabularies.update(existing.id, {
          srsStage: rv.srsStage,
          intervalDays: rv.intervalDays,
          easeFactor: rv.easeFactor,
          nextReviewAt: rv.nextReviewAt,
        })
      }
    }

    // 5. Merge AI Cache
    const localCacheMap = new Map(localCache.map((c) => [c.term, c]))
    for (const rc of remotePayload.aiCache ?? []) {
      const lc = localCacheMap.get(rc.term)
      if (!lc || rc.updatedAt > lc.updatedAt) {
        await db.aiCache.put(rc)
      }
    }
  }

  // Re-read merged local database to push back to Gist
  const mergedBooks = await db.books.toArray()
  const mergedAnns = await db.annotations.toArray()
  const mergedVocabs = await db.vocabularies.toArray()
  const mergedCache = await db.aiCache.toArray()

  // Also preserve remote books metadata for books not yet imported on this device
  const mergedBookKeys = new Set(mergedBooks.map(bookIdentityKey))
  const extraRemoteBooks = (remotePayload?.books ?? []).filter((rb) => !mergedBookKeys.has(bookIdentityKey(rb)))

  const latestSettings = useSettings.getState()
  const payloadToPush: SyncPayload = {
    version: 1,
    updatedAt: Date.now(),
    aiConfig: latestSettings.syncApiKey
      ? { aiProvider: latestSettings.aiProvider, apiKey: latestSettings.apiKey }
      : undefined,
    books: [
      ...mergedBooks.map(({ coverDataUrl: _c, ...rest }) => rest),
      ...extraRemoteBooks,
    ],
    annotations: mergedAnns,
    vocabularies: mergedVocabs,
    aiCache: mergedCache,
  }

  const body = {
    description: 'IT PDF Reader - Cloud Sync Data (Books Progress, Highlights, Vocabularies)',
    public: false,
    files: {
      [SYNC_FILENAME]: {
        content: JSON.stringify(payloadToPush, null, 2),
      },
    },
  }

  let status: 'merged' | 'created' = 'merged'
  if (gistId) {
    const updateRes = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!updateRes.ok) {
      throw new Error(`Cập nhật Gist thất bại (${updateRes.status})`)
    }
  } else {
    status = 'created'
    const createRes = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!createRes.ok) {
      throw new Error(`Tạo Gist mới thất bại (${createRes.status})`)
    }
    const created = await createRes.json()
    gistId = created.id
  }

  useSettings.getState().set({
    gistId,
    lastSyncedAt: Date.now(),
  })

  return {
    status,
    gistId,
    stats: {
      books: payloadToPush.books.length,
      annotations: mergedAnns.length,
      vocabularies: mergedVocabs.length,
    },
  }
}

/** Generate a 1-click setup URL/code to transfer API keys & Sync config to iPad/iPhone */
export function createQuickSetupLink(): string {
  const { aiProvider, apiKey, githubToken, gistId } = useSettings.getState()
  const payload = btoa(
    encodeURIComponent(JSON.stringify({ aiProvider, apiKey, githubToken, gistId })),
  )
  const baseUrl = window.location.origin + window.location.pathname
  return `${baseUrl}#setup=${payload}`
}

export function applyQuickSetupFromHash(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  if (!hash.startsWith('#setup=')) return false
  try {
    const encoded = hash.slice('#setup='.length)
    const data = JSON.parse(decodeURIComponent(atob(encoded)))
    useSettings.getState().set({
      ...(data.aiProvider ? { aiProvider: data.aiProvider } : {}),
      ...(data.apiKey ? { apiKey: data.apiKey } : {}),
      ...(data.githubToken ? { githubToken: data.githubToken } : {}),
      ...(data.gistId ? { gistId: data.gistId } : {}),
    })
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return true
  } catch {
    return false
  }
}
