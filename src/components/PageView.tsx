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
  cropMargins?: boolean
  savedWords?: Map<string, string>
  underlineVocab?: boolean
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
  cropMargins = false,
  savedWords,
  underlineVocab = true,
  onVisible,
  onAnnotationClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [size, setSize] = useState({ w: baseSize.w * scale, h: baseSize.h * scale })

  // Virtualization: render only when within ~2 pages of viewport; report page in view
  useEffect(() => {
    const el = wrapRef.current!
    const nearObs = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: '200% 0px' },
    )
    const visObs = new IntersectionObserver(
      ([e]) => e.isIntersecting && onVisible(pageNum),
      { rootMargin: '-45% 0px -45% 0px' },
    )
    nearObs.observe(el)
    visObs.observe(el)
    return () => {
      nearObs.disconnect()
      visObs.disconnect()
    }
  }, [pageNum, onVisible])

  useEffect(() => {
    setSize({ w: baseSize.w * scale, h: baseSize.h * scale })
  }, [scale, baseSize])

  useEffect(() => {
    const canvas = canvasRef.current!
    const textDiv = textRef.current!
    setRendered(false)
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
      tl.render()
        .then(() => {
          if (!cancelled) setRendered(true)
        })
        .catch(() => {})
      rt.promise.catch(() => {})
    })()
    return () => {
      cancelled = true
      task?.cancel()
      tl?.cancel()
    }
  }, [near, doc, pageNum, scale])

  // Underline saved vocabulary words inside the rendered TextLayer
  useEffect(() => {
    if (!rendered || !textRef.current) return
    const spans = textRef.current.querySelectorAll('span')
    if (!underlineVocab || !savedWords || savedWords.size === 0) {
      spans.forEach((sp) => {
        sp.style.borderBottom = ''
        sp.removeAttribute('title')
      })
      return
    }

    spans.forEach((sp) => {
      const txt = (sp.textContent || '').toLowerCase()
      if (!txt || txt.length < 3) return
      let matchedMeaning: string | null = null
      let matchedWord = ''
      for (const [w, meaning] of savedWords.entries()) {
        if (w.length >= 3 && txt.includes(w)) {
          // Verify word boundary so "rest" doesn't match "interest"
          const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          if (new RegExp(`\\b${escaped}\\b`, 'i').test(txt)) {
            matchedWord = w
            matchedMeaning = meaning
            break
          }
        }
      }
      if (matchedMeaning) {
        sp.style.borderBottom = '2px dotted rgba(56, 189, 248, 0.85)'
        sp.title = `📚 ${matchedWord}: ${matchedMeaning.split('\n')[0]}`
      } else {
        sp.style.borderBottom = ''
        sp.removeAttribute('title')
      }
    })
  }, [rendered, savedWords, underlineVocab])

  const filter =
    theme === 'dark'
      ? 'invert(0.9) hue-rotate(180deg)'
      : theme === 'sepia'
        ? 'sepia(0.45) brightness(0.97)'
        : 'none'

  return (
    <div
      ref={wrapRef}
      data-page={pageNum}
      className={
        'relative mx-auto mb-3 bg-white shadow-lg ' +
        (cropMargins ? 'overflow-hidden rounded-md' : '')
      }
      style={{ width: size.w, height: size.h }}
    >
      <div
        className="relative h-full w-full"
        style={
          cropMargins
            ? {
                transform: 'scale(1.14)',
                transformOrigin: 'center center',
              }
            : undefined
        }
      >
        <canvas ref={canvasRef} style={{ filter }} className="absolute left-0 top-0" />
        <div ref={textRef} className="textLayer absolute inset-0" />
        {annotations.map((a) =>
          a.rects.map((r, i) => (
            <div
              key={a.id + i}
              title={a.note}
              onClick={(e) => {
                e.stopPropagation()
                onAnnotationClick(a)
              }}
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
      </div>
      {!near && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          {pageNum}
        </div>
      )}
    </div>
  )
}
