"use client"

import { useEffect, useRef, useState } from "react"

let mermaidInitialized = false

async function initMermaid() {
  if (mermaidInitialized) return
  const mermaid = (await import("mermaid")).default
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    flowchart: { curve: "basis", htmlLabels: true },
    sequence:  { useMaxWidth: true },
    er:        { useMaxWidth: true },
  })
  mermaidInitialized = true
}

let counter = 0

export function MermaidBlock({ code }: { code: string }) {
  const ref       = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const id = useRef(`mermaid-${++counter}`)

  useEffect(() => {
    let cancelled = false
    setError(null)

    ;(async () => {
      try {
        await initMermaid()
        const mermaid = (await import("mermaid")).default
        const { svg } = await mermaid.render(id.current, code.trim())
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
          // make SVG responsive
          const svgEl = ref.current.querySelector("svg")
          if (svgEl) {
            svgEl.removeAttribute("height")
            svgEl.style.maxWidth = "100%"
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Lỗi render diagram")
      }
    })()

    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-mono overflow-x-auto">
        <p className="font-semibold mb-1">Mermaid render error:</p>
        <pre>{error}</pre>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="my-6 overflow-x-auto rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex justify-center"
    />
  )
}
