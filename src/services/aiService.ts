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
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    )
    if (!r.ok) throw new Error(`Gemini API lỗi (${r.status}). Kiểm tra lại API Key.`)
    const j = await r.json()
    reply = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '(không có phản hồi)'
  } else {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) throw new Error(`OpenAI API lỗi (${r.status}). Kiểm tra lại API Key.`)
    const j = await r.json()
    reply = j.choices?.[0]?.message?.content ?? '(không có phản hồi)'
  }

  if (isShortTerm && reply && !reply.startsWith('(')) {
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

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      },
    )
    if (!r.ok) throw new Error(`Gemini Vision lỗi (${r.status}). Kiểm tra lại API Key.`)
    const j = await r.json()
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '(không có phản hồi)'
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
    if (!r.ok) throw new Error(`OpenAI Vision lỗi (${r.status}). Kiểm tra lại API Key.`)
    const j = await r.json()
    return j.choices?.[0]?.message?.content ?? '(không có phản hồi)'
  }
}
