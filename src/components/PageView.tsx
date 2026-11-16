import { useEffect, useRef, useState } from 'react'
import { TextLayer } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import type { PDFDoc } from '../services/pdfService'
import type { Annotation } from '../db'
import type { Theme } from '../stores/useSettingsStore'

export const HL_COLORS: Record<string, string> = {
  yellow: 'rgba(250,204,21,0.4)',
  green: 'rgba(74,222,128,0.4)',
  blue: 'rgba(96,165,250,0.4)',
  red: 'rgba(248,113,113,0.4)',
}

interface Props {
  doc: PDFDoc
  pageNum: number
  scale: number
  baseSize: { w: number; h: number }
  theme: Theme
  annotations: Annotation[]
  onVisible: (page: number) => void
  onAnnotationClick: (a: Annotation) => void
}

export default function PageView({
  doc,
  pageNum,
  scale,
  baseSize,
  theme,
  annotations,
  onVisible,
  onAnnotationClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [size, setSize] = useState({ w: baseSize.w * scale, h: baseSize.h * scale })

  // Virtualization: render only when within ~2 pages of viewport; report page in view
  useEffect(() => {
    const el = wrapRef.current!
    const near = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: '200% 0px' },
    )
    const vis = new IntersectionObserver(
      ([e]) => e.isIntersecting && onVisible(pageNum),
      { rootMargin: '-45% 0px -45% 0px' },
    )
    near.observe(el)
    vis.observe(el)
    return () => {
      near.disconnect()
      vis.disconnect()
    }
  }, [pageNum, onVisible])

  useEffect(() => {
    setSize({ w: baseSize.w * scale, h: baseSize.h * scale })
  }, [scale, baseSize])

  useEffect(() => {
    const canvas = canvasRef.current!
    const textDiv = textRef.current!
    if (!near) {
      canvas.width = canvas.height = 0
      textDiv.replaceChildren()
      return
    }
    let cancelled = false
    let task: { cancel: () => void } | null = null
    let tl: TextLayer | null = null
    ;(async () => {
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      setSize({ w: viewport.width, h: viewport.height })
      const rt = page.render({
        canvasContext: canvas.getContext('2d')!,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      })
      task = rt
      textDiv.replaceChildren()
      textDiv.style.setProperty('--scale-factor', String(scale))
      tl = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport,
      })
      tl.render().catch(() => {})
      rt.promise.catch(() => {})
    })()
    return () => {
      cancelled = true
      task?.cancel()
      tl?.cancel()
    }
  }, [near, doc, pageNum, scale])

  const filter =
    theme === 'dark' ? 'invert(0.9) hue-rotate(180deg)' : theme === 'sepia' ? 'sepia(0.45) brightness(0.97)' : 'none'

  return (
    <div
      ref={wrapRef}
      data-page={pageNum}
      className="relative mx-auto mb-3 bg-white shadow-lg"
      style={{ width: size.w, height: size.h }}
    >
      <canvas ref={canvasRef} style={{ filter }} className="absolute left-0 top-0" />
      <div ref={textRef} className="textLayer absolute inset-0" />
      {annotations.map((a) =>
        a.rects.map((r, i) => (
          <div
            key={a.id + i}
            title={a.note}
            onClick={() => onAnnotationClick(a)}
            className="absolute cursor-pointer mix-blend-multiply"
            style={{
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.w}%`,
              height: `${r.h}%`,
              background: HL_COLORS[a.color],
              pointerEvents: 'auto',
            }}
          />
        )),
      )}
      {!near && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          {pageNum}
        </div>
      )}
    </div>
  )
}
