# IT PDF Reader (PWA Đọc PDF Tài Liệu CNTT Tiếng Anh)

Ứng dụng PWA (Progressive Web App) đọc tài liệu PDF tiếng Anh chuyên ngành CNTT theo triết lý **Local-First**, hỗ trợ tra cứu thuật ngữ chuyên ngành offline, phát âm chuẩn, tích hợp AI giải thích ngữ cảnh kỹ thuật (BYOK - Gemini/OpenAI) và hệ thống thẻ nhớ ôn tập **Spaced Repetition (SM-2)**.

Demo trực tuyến: [https://vuongvgc.github.io/it-pdf-reader/](https://vuongvgc.github.io/it-pdf-reader/)

---

## 🚀 Tính năng nổi bật

### 1. Trình đọc PDF tối ưu (Virtualized Rendering)
- **Tốc độ cao & Tiết kiệm RAM**: Dùng `pdfjs-dist` kết hợp `IntersectionObserver` chỉ render trang đang xem và lân cận, đọc mượt mà sách 500–1000+ trang mà không đơ máy.
- **Canvas + Text Layer**: Hiển thị đồ họa sắc nét đồng thời cho phép bôi đen chọn chữ chính xác.
- **Chế độ đọc đa dạng**: Light Mode, Sepia (dịu mắt), và Smart Dark Mode (đảo màu tối không chói mắt).
- **Điều hướng & Tìm kiếm**: Zoom (Fit width / Scale), Mục lục sách (Outline), Tìm kiếm từ khóa toàn sách, tự động ghi nhớ trang đọc cuối.

### 2. Trợ lý đọc tiếng Anh CNTT
- **Smart Selection**: Tự động bóc tách từ hoặc cụm từ được chọn kèm toàn bộ câu ngữ cảnh gốc (`contextSentence`).
- **Từ điển CNTT Offline**: Tích hợp sẵn hơn **240+ thuật ngữ chuyên sâu** về Kiến trúc phần mềm, Hệ thống phân tán, Database, DevOps, OOP và Design Patterns (bắt cụm từ 1–4 từ).
- **Bộ thẻ chuyên sâu Head First Software Architecture**: Nạp sẵn 29 thẻ thuật ngữ cốt lõi (Trade-offs, Coupling, EDA, Microkernel, ADRs, Bounded Context...).
- **Tra từ điển & Phát âm**: Kết nối Free Dictionary API (IPA, từ loại) và Web Speech API TTS đọc to tiếng Anh với tốc độ tùy chỉnh.
- **AI Giải thích theo ngữ cảnh (BYOK)**: Tích hợp Gemini Flash / OpenAI bằng API Key cá nhân để dịch tiếng Việt tự nhiên và giải thích khái niệm IT.

### 3. Highlight, Ghi chú & Flashcard (SM-2)
- **Highlight 4 màu**: Tọa độ chuẩn hóa theo tỷ lệ `%` trang, phóng to/thu nhỏ không bao giờ lệch vị trí.
- **Quản lý Ghi chú**: Thêm ghi chú cá nhân, xem danh sách theo trang và xuất toàn bộ ghi chú ra file **Markdown (`.md`)** để đồng bộ vào Obsidian / Notion.
- **Ôn tập Flashcard**: Ứng dụng thuật toán lặp lại ngắt quãng **SM-2** (Spaced Repetition).
- **Xuất / Nhập CSV**: Hỗ trợ xuất dữ liệu ra file CSV chuẩn Anki hoặc nhập các bộ thẻ từ vựng bên ngoài vào app.

### 4. PWA & Local-First (Offline 100%)
- **IndexedDB (`Dexie.js`)**: Lưu trữ toàn bộ dữ liệu, tiến độ đọc, highlight và file sách an toàn ngay trên máy bạn.
- **Service Worker & Manifest**: Hoạt động hoàn toàn khi mất mạng, cài đặt như ứng dụng native trên iOS/Android/macOS/Windows.
- **Sao lưu & Phục hồi**: Xuất/nhập toàn bộ dữ liệu ra 1 file `.json`.

---

## 🛠️ Công nghệ sử dụng

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **PDF Engine**: Mozilla `pdfjs-dist`
- **Database**: `Dexie.js` (IndexedDB Wrapper)
- **PWA**: `vite-plugin-pwa` (Workbox)
- **State Management**: `zustand`, `dexie-react-hooks`
- **Deployment**: GitHub Actions & GitHub Pages

---

## 💻 Cài đặt & Chạy cục bộ

```bash
# 1. Clone repository
git clone https://github.com/vuongvgc/it-pdf-reader.git
cd it-pdf-reader

# 2. Cài đặt dependencies
npm install

# 3. Chạy môi trường phát triển
npm run dev

# 4. Build sản phẩm (PWA)
npm run build
npm run preview
```

---

## 📄 Bản quyền & Đóng góp

Dự án được phát triển dưới giấy phép MIT. Mọi đóng góp (Pull Request, Issue) đều được hoan nghênh!
