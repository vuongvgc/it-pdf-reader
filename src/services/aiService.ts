import { useSettings } from '../stores/useSettingsStore'

export async function explainIT(opts: {
  text: string
  context: string
  bookTitle: string
}): Promise<string> {
  const { aiProvider, apiKey } = useSettings.getState()
  if (!apiKey) throw new Error('Chưa có API key. Vào Cài đặt để nhập (Gemini/OpenAI).')
  const prompt = `Bạn là trợ lý đọc tài liệu CNTT. Sách: "${opts.bookTitle}".
Đoạn/từ được chọn: "${opts.text}"
Câu ngữ cảnh: "${opts.context}"
Hãy: 1) Dịch sang tiếng Việt tự nhiên; 2) Giải thích ngắn gọn khái niệm kỹ thuật/đoạn code theo ngữ cảnh IT. Trả lời ngắn, dùng tiếng Việt, giữ nguyên thuật ngữ gốc tiếng Anh.`

  if (aiProvider === 'gemini') {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    )
    if (!r.ok) throw new Error(`Gemini lỗi ${r.status}`)
    const j = await r.json()
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '(không có phản hồi)'
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!r.ok) throw new Error(`OpenAI lỗi ${r.status}`)
  const j = await r.json()
  return j.choices?.[0]?.message?.content ?? '(không có phản hồi)'
}
