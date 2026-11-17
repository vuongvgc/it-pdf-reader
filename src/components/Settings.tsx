import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../stores/useSettingsStore'
import { exportBackup, importBackup } from '../services/exportService'
import { syncWithGist, createQuickSetupLink } from '../services/syncService'
import {
  Sparkles, Volume2, Save, HardDrive, Cloud, RefreshCw, Share2, ExternalLink, Check, BookOpen,
  Smartphone, Download,
} from 'lucide-react'
import { usePWAInstall } from '../hooks/usePWAInstall'
import InstallGuideModal from './InstallGuideModal'
import { listAvailableGeminiModels } from '../services/aiService'

export default function Settings() {
  const s = useSettings()
  const { isStandalone, isIOSDevice, showGuideModal, setShowGuideModal, triggerInstall } = usePWAInstall()
  const [usage, setUsage] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [keyTestMsg, setKeyTestMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const e = await navigator.storage?.estimate?.()
    if (e) setUsage(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB / ${((e.quota ?? 0) / 1048576).toFixed(0)} MB`)
    setPersisted((await navigator.storage?.persisted?.()) ?? null)
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await syncWithGist()
      setSyncMsg(
        `✓ Đồng bộ thành công (${res.stats.books} sách, ${res.stats.annotations} highlight, ${res.stats.vocabularies} từ vựng)`,
      )
    } catch (e: any) {
      setSyncMsg('⚠ ' + e.message)
    }
    setSyncing(false)
  }

  const copyQuickSetup = async () => {
    const link = createQuickSetupLink()
    await navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 3500)
  }

  return (
    <div className="safe-top pb-28 mx-auto max-w-xl space-y-5 p-4 sm:p-6 text-sm">
      {/* 1. Cloud Sync via GitHub Secret Gist */}
      <section className="rounded-2xl border border-sky-800/60 bg-gradient-to-br from-slate-800/90 to-slate-900 p-5 shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-sky-300 flex items-center gap-2">
            <Cloud size={19} className="text-sky-400" /> Đồng bộ Mac ↔ iPad ↔ iPhone (GitHub Gist)
          </h2>
          {s.lastSyncedAt > 0 && (
            <span className="text-[11px] text-emerald-400">
              Đã lưu: {new Date(s.lastSyncedAt).toLocaleTimeString('vi-VN')}
            </span>
          )}
        </div>

        <div className="mb-3 rounded-xl bg-slate-900/70 border border-slate-800 p-3 text-xs text-slate-300 leading-relaxed space-y-1">
          <div>
            <b>Cách hoạt động:</b> Lưu tiến độ trang đọc, highlight, ghi chú và toàn bộ Flashcard vào 1 file <b>Secret Gist</b> riêng tư trên tài khoản GitHub của bạn.
          </div>
          <div>
            <a
              href="https://github.com/settings/tokens/new?scopes=gist&description=IT-PDF-Reader-Sync"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-400 hover:underline font-semibold"
            >
              👉 Bấm vào đây để lấy GitHub Token (đã chọn sẵn quyền gist) <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <label className="block text-xs text-slate-400 mb-1">GitHub Personal Access Token (quyền `gist`)</label>
        <input
          type="password"
          value={s.githubToken}
          onChange={(e) => s.set({ githubToken: e.target.value })}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-500 font-mono text-xs"
        />

        <label className="block text-xs text-slate-400 mb-1">
          Gist ID <span className="text-slate-500">(Để trống sẽ tự động tìm hoặc tạo mới)</span>
        </label>
        <input
          type="text"
          value={s.gistId}
          onChange={(e) => s.set({ gistId: e.target.value })}
          placeholder="Tự động điền sau lần đồng bộ đầu tiên…"
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-slate-300 outline-none focus:border-sky-500 font-mono text-xs"
        />

        <div className="mb-3 flex flex-col gap-2 text-xs text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={s.autoSync}
              onChange={(e) => s.set({ autoSync: e.target.checked })}
              className="accent-sky-400 h-4 w-4 rounded"
            />
            Tự động đồng bộ ngầm khi mở ứng dụng và khi đóng sách
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={s.syncApiKey}
              onChange={(e) => s.set({ syncApiKey: e.target.checked })}
              className="accent-sky-400 h-4 w-4 rounded"
            />
            Đồng bộ kèm cả AI API Key trong Secret Gist (sang iPad không cần nhập lại)
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn !min-h-[42px] !bg-sky-600 hover:!bg-sky-500 text-white font-semibold flex-1"
            onClick={handleSync}
            disabled={syncing || !s.githubToken.trim()}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Đang đồng bộ…' : '☁️ Đồng bộ ngay'}
          </button>

          {(s.githubToken || s.apiKey) && (
            <button
              className="btn !min-h-[42px] text-xs"
              onClick={copyQuickSetup}
              title="Copy link chứa sẵn Key để mở trên iPad/iPhone"
            >
              {copiedLink ? <Check size={15} className="text-emerald-400" /> : <Share2 size={15} />}
              {copiedLink ? 'Đã copy link cho iPad!' : 'Copy Link cài nhanh cho iPad'}
            </button>
          )}
        </div>

        {syncMsg && (
          <div
            className={
              'mt-3 rounded-xl p-2.5 text-xs font-medium ' +
              (syncMsg.startsWith('✓')
                ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/70 border border-rose-500/40 text-rose-200')
            }
          >
            {syncMsg}
          </div>
        )}
      </section>

      {/* 2. AI Configuration (BYOK) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-sky-300 flex items-center gap-2">
            <Sparkles size={18} className="text-amber-400" /> AI Dịch, Giải thích IT & Đọc Sơ đồ (BYOK)
          </h2>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-300 hover:underline font-medium"
          >
            Lấy Gemini Key miễn phí <ExternalLink size={12} />
          </a>
        </div>

        <label className="block text-xs text-slate-400 mb-1">Nhà cung cấp AI</label>
        <select
          value={s.aiProvider}
          onChange={(e) => s.set({ aiProvider: e.target.value as 'gemini' | 'openai' })}
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-200 outline-none"
        >
          <option value="gemini">Google Gemini (Tự động chọn Model mới nhất: 2.5 Flash / 2.0 Flash - Miễn phí)</option>
          <option value="openai">OpenAI (GPT-4o Mini)</option>
        </select>
        <label className="block text-xs text-slate-400 mb-1">API Key</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={s.apiKey}
            onChange={(e) => {
              s.set({ apiKey: e.target.value })
              setKeyTestMsg('')
            }}
            placeholder="Dán mã AIzaSy... (Gemini) hoặc sk-... (OpenAI)"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-500 font-mono text-xs"
          />
          {s.aiProvider === 'gemini' && (
            <button
              type="button"
              disabled={testingKey || !s.apiKey.trim()}
              onClick={async () => {
                setTestingKey(true)
                setKeyTestMsg('')
                try {
                  const models = await listAvailableGeminiModels(s.apiKey)
                  if (models.length > 0) {
                    setKeyTestMsg(
                      `✓ Key hợp lệ! Sẵn sàng dùng model: ${models.slice(0, 3).map((m) => m.model).join(', ')}`,
                    )
                  } else {
                    setKeyTestMsg('⚠ Key không tìm thấy model nào hỗ trợ generateContent.')
                  }
                } catch (err: any) {
                  setKeyTestMsg('⚠ ' + err.message)
                }
                setTestingKey(false)
              }}
              className="btn !min-h-[42px] shrink-0 text-xs border border-sky-500/40 text-sky-300"
            >
              {testingKey ? 'Đang dò…' : 'Kiểm tra Key'}
            </button>
          )}
        </div>
        {keyTestMsg && (
          <div
            className={
              'mt-2 rounded-xl p-2.5 text-xs font-medium ' +
              (keyTestMsg.startsWith('✓')
                ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/70 border border-rose-500/40 text-rose-200')
            }
          >
            {keyTestMsg}
          </div>
        )}
        <div className="mt-2 text-[11px] text-slate-400">
          💡 Mỗi từ được AI giải thích sẽ tự động lưu vào bộ nhớ đệm (AI Cache) để lần sau hiện tức thì.
        </div>
      </section>

      {/* 3. Reading Preferences */}
      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <BookOpen size={18} /> Tùy chọn hiển thị khi đọc sách
        </h2>
        <div className="space-y-2.5 text-xs text-slate-200">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={s.underlineVocab}
              onChange={(e) => s.set({ underlineVocab: e.target.checked })}
              className="accent-sky-400 h-4 w-4 rounded"
            />
            Gạch chân chấm bi xanh các từ vựng bạn đã lưu khi xuất hiện trên trang PDF
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={s.cropMargins}
              onChange={(e) => s.set({ cropMargins: e.target.checked })}
              className="accent-sky-400 h-4 w-4 rounded"
            />
            Cắt bớt lề trắng thừa (Crop Margins) để chữ to hơn trên iPad / Điện thoại
          </label>
        </div>
      </section>

      {/* 4. TTS Voice Rate */}
      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <Volume2 size={18} /> Tốc độ đọc phát âm tiếng Anh (TTS)
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

      {/* 5. Local Backup & Restore */}
      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <Save size={18} /> Sao lưu & Phục hồi thủ công (File JSON)
        </h2>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn !min-h-[40px]" onClick={() => exportBackup(false)}>
            Xuất JSON (Nhẹ - Không kèm PDF)
          </button>
          <button className="btn !min-h-[40px]" onClick={() => exportBackup(true)}>
            Xuất JSON (Đầy đủ kèm PDF)
          </button>
          <button className="btn !min-h-[40px] !bg-sky-600 hover:!bg-sky-500 text-white" onClick={() => file.current?.click()}>
            Nhập file JSON
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

      {/* 6. Storage Quota */}
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

      {/* 7. PWA Standalone Mode & iPad Installation */}
      <section className="rounded-2xl border border-slate-800 bg-slate-800/60 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-sky-300 flex items-center gap-2">
          <Smartphone size={18} /> Cài đặt App trên iPad / Mobile (PWA)
        </h2>
        <div className="space-y-1.5 text-slate-300 text-xs">
          <div>
            Trạng thái hiện tại:{' '}
            <b className={isStandalone ? 'text-emerald-400' : 'text-amber-400'}>
              {isStandalone
                ? '✓ Đang chạy ở chế độ App độc lập (Toàn màn hình)'
                : 'Đang chạy trong trình duyệt web'}
            </b>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed pt-1">
            Cài đặt ứng dụng lên màn hình chính giúp mở sách nhanh hơn, loại bỏ thanh địa chỉ duyệt web và đọc PDF toàn màn hình như một ứng dụng native.
          </p>
        </div>

        {!isStandalone ? (
          <button
            className="btn mt-3 !min-h-[40px] !bg-sky-600 hover:!bg-sky-500 text-white flex items-center gap-2"
            onClick={triggerInstall}
          >
            <Download size={16} />
            {isIOSDevice ? 'Xem hướng dẫn cài đặt trên iPad / iPhone' : 'Cài đặt App vào máy'}
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <Check size={16} /> Ứng dụng đã được thêm vào Màn hình chính
          </div>
        )}
      </section>

      <InstallGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        isIOS={isIOSDevice}
      />
    </div>
  )
}
