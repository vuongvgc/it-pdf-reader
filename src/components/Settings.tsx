import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../stores/useSettingsStore'
import { exportBackup, importBackup } from '../services/exportService'
import { Sparkles, Volume2, Save, HardDrive } from 'lucide-react'

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
    <div className="safe-top pb-28 mx-auto max-w-xl space-y-6 p-4 sm:p-6 text-sm">
      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <Sparkles size={18} className="text-amber-400" /> AI Dịch & Giải thích IT (BYOK)
        </h2>
        <label className="block text-xs text-slate-400 mb-1">Mô hình AI</label>
        <select
          value={s.aiProvider}
          onChange={(e) => s.set({ aiProvider: e.target.value as 'gemini' | 'openai' })}
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-200 outline-none"
        >
          <option value="gemini">Google Gemini (gemini-2.0-flash - Khuyên dùng)</option>
          <option value="openai">OpenAI (gpt-4o-mini)</option>
        </select>
        <label className="block text-xs text-slate-400 mb-1">API Key</label>
        <input
          type="password"
          value={s.apiKey}
          onChange={(e) => s.set({ apiKey: e.target.value })}
          placeholder="Nhập API key của bạn (chỉ lưu cục bộ trên thiết bị)"
          className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-500"
        />
        <div className="mt-2 text-[11px] text-slate-400">
          Khóa API được mã hóa và chỉ lưu trên trình duyệt máy bạn, không bao giờ gửi đi đâu khác.
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <Volume2 size={18} /> Đọc phát âm tiếng Anh (TTS)
        </h2>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0.8}
            max={1.5}
            step={0.1}
            value={s.ttsRate}
            onChange={(e) => s.set({ ttsRate: Number(e.target.value) })}
            className="flex-1 accent-sky-400 cursor-pointer h-2 bg-slate-700 rounded-lg"
          />
          <span className="font-mono text-sm font-bold text-sky-400 w-12 text-right">
            {s.ttsRate.toFixed(1)}x
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <Save size={18} /> Sao lưu & Phục hồi dữ liệu
        </h2>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn !min-h-[40px]" onClick={() => exportBackup(false)}>
            Xuất JSON (Metadata & Từ vựng)
          </button>
          <button className="btn !min-h-[40px]" onClick={() => exportBackup(true)}>
            Xuất JSON (Kèm toàn bộ PDF)
          </button>
          <button className="btn !min-h-[40px] !bg-sky-600 hover:!bg-sky-500 text-white" onClick={() => file.current?.click()}>
            Nhập file JSON sao lưu
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                await importBackup(f)
                alert('Đã khôi phục dữ liệu thành công!')
              }
            }}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <HardDrive size={18} /> Bộ nhớ & Lưu trữ Offline
        </h2>
        <div className="space-y-1.5 text-slate-300 text-xs">
          <div>Dung lượng đã sử dụng: <b className="text-slate-100">{usage || 'đang tính…'}</b></div>
          <div>Lưu trữ bền vững (Persistent): <b className="text-slate-100">{persisted === null ? 'không hỗ trợ' : persisted ? 'Đã kích hoạt ✓' : 'Chưa'}</b></div>
        </div>
        {persisted === false && (
          <button
            className="btn mt-3 !min-h-[40px] !bg-sky-600 text-white"
            onClick={async () => {
              await navigator.storage.persist()
              refresh()
            }}
          >
            Yêu cầu lưu bền vững (Tránh bị Safari xoá)
          </button>
        )}
      </section>
    </div>
  )
}
