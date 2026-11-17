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

let resolvedGeminiEndpoint: { version: string; model: string } | null = null

async function discoverWorkingGeminiModel(apiKey: string): Promise<{ version: string; model: string } | null> {
  const versions = ['v1', 'v1beta']
  for (const ver of versions) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey.trim()}`)
      if (res.ok) {
        const data = await res.json()
        const models: any[] = data.models || []
        const validModels = models.filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent'),
        )
        const best =
          validModels.find((m) => m.name.includes('gemini-1.5-flash')) ||
          validModels.find((m) => m.name.includes('gemini-2.0-flash')) ||
          validModels.find((m) => m.name.includes('flash')) ||
          validModels.find((m) => m.name.includes('pro')) ||
          validModels[0]

        if (best) {
          const cleanModel = best.name.replace(/^models\//, '')
          return { version: ver, model: cleanModel }
        }
      }
    } catch {
      // Continue to next version
    }
  }
  return null
}

/**
 * Universal Gemini API caller:
 * 1. Checks v1 stable endpoint (gemini-1.5-flash)
 * 2. Falls back to v1beta endpoints
 * 3. If needed, dynamically discovers the exact model list provisioned for this user's API key
 */
async function callGemini(apiKey: string, parts: any[]): Promise<string> {
  const key = apiKey.trim()
  if (!key) throw new Error('NO_API_KEY')

  const candidates: Array<{ version: string; model: string }> = []
  if (resolvedGeminiEndpoint) {
    candidates.push(resolvedGeminiEndpoint)
  }
  candidates.push(
    { version: 'v1', model: 'gemini-1.5-flash' },
    { version: 'v1beta', model: 'gemini-1.5-flash' },
    { version: 'v1beta', model: 'gemini-2.0-flash' },
    { version: 'v1', model: 'gemini-1.5-pro' },
    { version: 'v1', model: 'gemini-pro' },
  )

  let lastError = ''

  for (const { version, model } of candidates) {
    try {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${key}`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      })

      if (r.ok) {
        const j = await r.json()
        resolvedGeminiEndpoint = { version, model }
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text
        return text ?? '(không có phản hồi)'
      }

      const errJson = await r.json().catch(() => null)
      const message = errJson?.error?.message || `Mã lỗi HTTP ${r.status}`
      lastError = message

      // If 404 (model not found for this API version), try the next candidate
      if (r.status === 404) {
        continue
      }

      // If key is invalid (400) or permission denied (403), stop immediately with clear message
      throw new Error(`Google API: ${message}`)
    } catch (e: any) {
      if (e.message && e.message.startsWith('Google API:')) {
        throw e
      }
      lastError = e.message
    }
  }

  // Dynamic discovery fallback if all hardcoded endpoints gave 404
  const discovered = await discoverWorkingGeminiModel(key)
  if (discovered) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/${discovered.version}/models/${discovered.model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      },
    )
    if (r.ok) {
      const j = await r.json()
      resolvedGeminiEndpoint = discovered
      return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '(không có phản hồi)'
    }
  }

  throw new Error(`Gemini: ${lastError || 'Không thể kết nối tới mô hình AI'}`)
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
