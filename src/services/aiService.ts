import { db } from '../db'
import { useSettings } from '../stores/useSettingsStore'

const normalizeTerm = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/^[^\w\s-]+|[^\w\s-]+$/g, '')
    .replace(/\s+/g, ' ')

export async function lookupAICache(text: string): Promise<string | null> {
  const key = normalizeTerm(text)
  if (!key || key.split(' ').length > 6) return null
  const item = await db.aiCache.get(key)
  return item?.explanation ?? null
}

interface GeminiTarget {
  version: 'v1beta' | 'v1'
  model: string
}

let cachedWorkingTarget: GeminiTarget | null = null
let cachedKeyUsed = ''

function scoreGeminiModel(modelId: string): number {
  let score = 0
  if (modelId.includes('flash')) score += 100
  if (modelId.includes('pro')) score += 50

  if (modelId.includes('2.5')) score += 45
  else if (modelId.includes('3.')) score += 50
  else if (modelId.includes('2.0')) score += 35
  else if (modelId.includes('latest')) score += 25
  else if (modelId.includes('1.5')) score += 10

  if (!modelId.includes('exp') && !modelId.includes('preview')) score += 20
  if (modelId === 'gemini-2.5-flash') score += 60
  if (modelId === 'gemini-2.0-flash') score += 45
  if (modelId === 'gemini-flash-latest') score += 40
  if (modelId === 'gemini-2.5-flash-lite') score += 35
  return score
}

/**
 * Calls ModelService.ListModels on v1beta and v1 to get the exact list of models
 * enabled for this API key that support `generateContent`.
 */
export async function listAvailableGeminiModels(apiKey: string): Promise<GeminiTarget[]> {
  const key = apiKey.trim()
  const versions: Array<'v1beta' | 'v1'> = ['v1beta', 'v1']
  const seen = new Set<string>()
  const targets: GeminiTarget[] = []
  let authError = ''

  for (const version of versions) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${version}/models?key=${key}`)
      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        const msg = errJson?.error?.message || `HTTP ${res.status}`
        if (res.status === 400 || res.status === 403) {
          authError = msg
        }
        continue
      }

      const data = await res.json()
      const models: any[] = data.models || []

      for (const m of models) {
        const rawName: string = m.name || ''
        const methods: string[] = m.supportedGenerationMethods || []
        if (!methods.includes('generateContent')) continue
        if (!rawName.startsWith('models/gemini')) continue

        const model = rawName.replace(/^models\//, '')
        // Exclude specialized non-text models (TTS, imagen, audio-only, etc.)
        if (/(-tts|image-generation|robotics|computer-use|embedding|aqa|vision|veo|imagen|learnlm)/i.test(model)) {
          continue
        }

        if (!seen.has(model)) {
          seen.add(model)
          targets.push({ version, model })
        }
      }
    } catch {
      // Ignore network error for one version and try next
    }
  }

  if (targets.length === 0 && authError) {
    throw new Error(`Google API: ${authError}`)
  }

  targets.sort((a, b) => scoreGeminiModel(b.model) - scoreGeminiModel(a.model))
  return targets
}

/**
 * Universal Gemini API caller:
 * Queries `ListModels` first to discover exact models supported by the user's API key,
 * then calls `generateContent` with automatic fallback across available models.
 */
async function callGemini(apiKey: string, parts: any[]): Promise<string> {
  const key = apiKey.trim()
  if (!key) throw new Error('NO_API_KEY')

  if (cachedKeyUsed !== key) {
    cachedWorkingTarget = null
    cachedKeyUsed = key
  }

  // 1. Discover available models directly from Google's ModelService.ListModels
  let targets: GeminiTarget[] = []
  if (cachedWorkingTarget) {
    targets.push(cachedWorkingTarget)
  }

  const discovered = await listAvailableGeminiModels(key)
  for (const d of discovered) {
    if (!targets.some((t) => t.model === d.model && t.version === d.version)) {
      targets.push(d)
    }
  }

  // Fallback list only if ListModels returned empty for any unexpected reason
  if (targets.length === 0) {
    targets = [
      { version: 'v1beta', model: 'gemini-2.5-flash' },
      { version: 'v1beta', model: 'gemini-2.0-flash' },
      { version: 'v1beta', model: 'gemini-flash-latest' },
    ]
  }

  let firstMeaningfulError = ''

  // Try up to 6 best matching models
  for (const target of targets.slice(0, 6)) {
    try {
      const url = `https://generativelanguage.googleapis.com/${target.version}/models/${target.model}:generateContent?key=${key}`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      })

      if (r.ok) {
        const j = await r.json()
        cachedWorkingTarget = target
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text
        return text ?? '(không có phản hồi)'
      }

      const errJson = await r.json().catch(() => null)
      const message = errJson?.error?.message || `Mã lỗi HTTP ${r.status}`

      // If key is invalid (400 API_KEY_INVALID), stop immediately
      if (r.status === 400 && /api key/i.test(message)) {
        throw new Error(`Google API Key không hợp lệ: ${message}`)
      }

      if (!firstMeaningfulError) {
        firstMeaningfulError = `[${target.model}] ${message}`
      }

      // If 404 (not found), 429 (quota 0 on specific tier), or 503 (overloaded), try next available model
      continue
    } catch (e: any) {
      if (e.message && e.message.startsWith('Google API')) {
        throw e
      }
      if (!firstMeaningfulError) {
        firstMeaningfulError = e.message
      }
    }
  }

  throw new Error(`Gemini: ${firstMeaningfulError || 'Không tìm thấy model khả dụng cho API Key này'}`)
}

export async function explainIT(opts: {
  text: string
  context: string
  bookTitle: string
  forceRefresh?: boolean
}): Promise<string> {
  const key = normalizeTerm(opts.text)
  const isShortTerm = key.split(' ').length <= 6

  if (isShortTerm && !opts.forceRefresh) {
    const cached = await db.aiCache.get(key)
    if (cached) return cached.explanation
  }

  const { aiProvider, apiKey } = useSettings.getState()
  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }

  const prompt = `Bạn là trợ lý chuyên gia đọc tài liệu Kiến trúc phần mềm & CNTT. Sách: "${opts.bookTitle}".
Đoạn/từ được chọn: "${opts.text}"
Câu ngữ cảnh: "${opts.context}"
Hãy:
1) Dịch sang tiếng Việt tự nhiên, chuẩn xác.
2) Giải thích ngắn gọn, dễ hiểu khái niệm kỹ thuật hoặc ý đồ thiết kế theo ngữ cảnh IT (giữ nguyên thuật ngữ gốc tiếng Anh trong ngoặc).`

  let reply = ''
  if (aiProvider === 'gemini') {
    reply = await callGemini(apiKey, [{ text: prompt }])
  } else {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) {
      const errJson = await r.json().catch(() => null)
      throw new Error(`OpenAI API: ${errJson?.error?.message || `Mã lỗi ${r.status}`}`)
    }
    const j = await r.json()
    reply = j.choices?.[0]?.message?.content ?? '(không có phản hồi)'
  }

  if (isShortTerm && reply && !reply.startsWith('(') && !reply.startsWith('⚠')) {
    await db.aiCache.put({
      term: key,
      explanation: reply.trim(),
      updatedAt: Date.now(),
    })
  }

  return reply.trim()
}

/** Multimodal AI Vision: Explain diagrams, tables, exercises or summarize the current PDF page */
export async function askPageAI(opts: {
  imageDataUrl: string | null
  pageText: string
  pageNumber: number
  bookTitle: string
  question: string
}): Promise<string> {
  const { aiProvider, apiKey } = useSettings.getState()
  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }

  const systemPrompt = `Bạn là Kiến trúc sư phần mềm (Software Architect) hỗ trợ người đọc cuốn sách "${opts.bookTitle}" (đang ở trang ${opts.pageNumber}).
Nội dung văn bản trích xuất trên trang (nếu có):
"""
${opts.pageText.slice(0, 3500)}
"""
Yêu cầu của người đọc: ${opts.question}
Hãy trả lời bằng tiếng Việt thật rõ ràng, có cấu trúc gạch đầu dòng dễ đọc, giải thích chi tiết các sơ đồ kiến trúc (mũi tên, thành phần, trade-off) hoặc bài tập xuất hiện trong hình ảnh trang sách.`

  if (aiProvider === 'gemini') {
    const parts: any[] = [{ text: systemPrompt }]
    if (opts.imageDataUrl && opts.imageDataUrl.includes('base64,')) {
      const base64Data = opts.imageDataUrl.split('base64,')[1]
      parts.unshift({
        inline_data: {
          mime_type: 'image/jpeg',
          data: base64Data,
        },
      })
    }
    return await callGemini(apiKey, parts)
  } else {
    const content: any[] = [{ type: 'text', text: systemPrompt }]
    if (opts.imageDataUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: opts.imageDataUrl },
      })
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content }],
      }),
    })
    if (!r.ok) {
      const errJson = await r.json().catch(() => null)
      throw new Error(`OpenAI Vision: ${errJson?.error?.message || `Mã lỗi ${r.status}`}`)
    }
    const j = await r.json()
    return j.choices?.[0]?.message?.content ?? '(không có phản hồi)'
  }
}
