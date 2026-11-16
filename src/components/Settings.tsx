import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../stores/useSettingsStore'
import { exportBackup, importBackup } from '../services/exportService'

export default function Settings() {
  const s = useSettings()
  const [usage, setUsage] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const e = await navigator.storage?.estimate?.()
    if (e) setUsage(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB / ${((e.quota ?? 0) / 1048576).toFixed(0)} MB`)
    setPersisted((await navigator.storage?.persisted?.()) ?? null)
  }
  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 text-sm">
      <section>
        <h2 className="mb-2 text-lg font-semibold">AI (BYOK)</h2>
        <select
          value={s.aiProvider}
          onChange={(e) => s.set({ aiProvider: e.target.value as 'gemini' | 'openai' })}
          className="mb-2 w-full rounded bg-slate-800 p-2"
        >
          <option value="gemini">Gemini (gemini-2.0-flash)</option>
          <option value="openai">OpenAI (gpt-4o-mini)</option>
        </select>
        <input
          type="password"
          value={s.apiKey}
          onChange={(e) => s.set({ apiKey: e.target.value })}
          placeholder="API key (chỉ lưu trong trình duyệt này)"
          className="w-full rounded bg-slate-800 p-2"
        />
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Đọc to (TTS)</h2>
        <input
          type="range"
          min={0.8}
          max={1.5}
          step={0.1}
          value={s.ttsRate}
          onChange={(e) => s.set({ ttsRate: Number(e.target.value) })}
          className="w-full"
        />
        <div>Tốc độ: {s.ttsRate.toFixed(1)}x</div>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Sao lưu & Khôi phục</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn !py-2" onClick={() => exportBackup(false)}>Xuất JSON (không kèm PDF)</button>
          <button className="btn !py-2" onClick={() => exportBackup(true)}>Xuất JSON (kèm PDF)</button>
          <button className="btn !py-2" onClick={() => file.current?.click()}>Nhập JSON</button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                await importBackup(f)
                alert('Đã khôi phục dữ liệu')
              }
            }}
          />
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Lưu trữ</h2>
        <div>Đang dùng: {usage || 'không rõ'}</div>
        <div>Persistent: {persisted === null ? 'không hỗ trợ' : persisted ? 'Có ✓' : 'Chưa'}</div>
        {persisted === false && (
          <button
            className="btn mt-2 !py-2"
            onClick={async () => {
              await navigator.storage.persist()
              refresh()
            }}
          >
            Yêu cầu lưu bền vững
          </button>
        )}
      </section>
    </div>
  )
}
