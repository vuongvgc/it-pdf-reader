import { X, Share2, PlusSquare, Check, Maximize2, WifiOff, Smartphone } from 'lucide-react'

interface InstallGuideModalProps {
  isOpen: boolean
  onClose: () => void
  isIOS: boolean
}

export default function InstallGuideModal({ isOpen, onClose, isIOS }: InstallGuideModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-sky-500/40 bg-gradient-to-b from-slate-800 to-slate-900 p-6 text-slate-100 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition"
          aria-label="Đóng"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 pr-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30">
            <Smartphone size={26} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {isIOS ? 'Cài đặt App lên iPad / iPhone' : 'Cài đặt IT PDF Reader'}
            </h3>
            <p className="text-xs text-slate-400">
              Trải nghiệm đọc sách toàn màn hình & tra từ nhanh không giới hạn
            </p>
          </div>
        </div>

        {/* Value Proposition Pills */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-xl bg-slate-800/80 border border-slate-700/60 p-2.5 text-slate-300">
            <Maximize2 size={16} className="text-emerald-400 shrink-0" />
            <span>Toàn màn hình không viền</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-800/80 border border-slate-700/60 p-2.5 text-slate-300">
            <WifiOff size={16} className="text-amber-400 shrink-0" />
            <span>Offline 100% không cần mạng</span>
          </div>
        </div>

        {/* Step-by-step instructions */}
        <div className="space-y-3 rounded-xl bg-slate-950/60 border border-slate-800 p-4 text-xs leading-relaxed">
          <div className="font-semibold text-sky-300 mb-2">
            {isIOS ? '3 bước thêm vào Màn hình chính trên iPad (Safari):' : 'Hướng dẫn thêm vào Màn hình chính:'}
          </div>

          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-bold text-sky-400 text-xs border border-sky-400/30">
              1
            </span>
            <div>
              Chạm vào nút <b className="text-white">Chia sẻ</b> (
              <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-sky-400 border border-slate-700 align-middle">
                <Share2 size={12} /> Share
              </span>
              ) trên thanh công cụ Safari của iPad (thường ở góc phải thanh địa chỉ).
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-bold text-sky-400 text-xs border border-sky-400/30">
              2
            </span>
            <div>
              Cuộn menu xuống và chọn dòng{' '}
              <b className="text-white">
                <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400 border border-slate-700 align-middle">
                  <PlusSquare size={12} /> Thêm vào MH chính
                </span>
              </b>{' '}
              <i>(Add to Home Screen)</i>.
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-bold text-sky-400 text-xs border border-sky-400/30">
              3
            </span>
            <div>
              Chạm nút <b className="text-white">Thêm (Add)</b> ở góc trên bên phải để hoàn tất.
            </div>
          </div>
        </div>

        {/* Tip Box */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-300">
          💡 <b>Gợi ý:</b> Sau khi cài đặt, bạn mở icon <b>IT Reader</b> trên màn hình chính iPad để tận hưởng không gian đọc sách rộng rãi nhất!
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="btn !min-h-[42px] w-full !bg-sky-600 hover:!bg-sky-500 text-white font-semibold flex items-center justify-center gap-2"
          >
            <Check size={18} /> Đã hiểu
          </button>
        </div>
      </div>
    </div>
  )
}
