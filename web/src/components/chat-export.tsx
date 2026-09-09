"use client"

// Xuất file trong khung chat (Excel/CSV/JSON/PDF/Word) — dùng chung Gấu Pro + Bé Gấu.
// Tách từ analytics/creator/ai/page.tsx (s192+1) khi thêm xuất file cho Bé Gấu, tránh chép lại ~250 dòng.

import { useState } from "react"
import { Download, Loader2, FileText, FileSpreadsheet, FileJson, FileType } from "lucide-react"

// ─── Parse ```export marker → { formats, title, sql? }. Null nếu không có marker (không hiện nút). ───
// sql (nếu có, đặt CUỐI marker) → Excel xuất FULL data từ server, không giới hạn 200 dòng.
export function parseExportMarker(text: string): { formats: Set<string>; title: string; sql?: string } | null {
  const m = text.match(/```export\s*([\s\S]*?)```/)
  if (!m) return null
  const body    = m[1]
  const fmtLine = body.match(/formats?\s*:\s*(.+)/i)?.[1] || ""
  const formats = new Set(fmtLine.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
  const title   = body.match(/title\s*:\s*(.+)/i)?.[1]?.trim() || "Báo cáo"
  const sql     = body.match(/sql\s*:\s*([\s\S]+)$/i)?.[1]?.trim() || undefined
  if (!formats.size) return null
  return { formats, title, sql }
}

export function extractCSVBlock(text: string) {
  const m = text.match(/```csv\s*([\s\S]*?)\s*```/)
  return m ? m[1] : null
}

export function extractJSONArray(text: string) {
  const m = text.match(/```json\s*(\[[\s\S]*?])\s*```/)
  return m ? m[1] : null
}

export function extractMarkdownTable(text: string): string | null {
  const m = text.match(/(\|.+\|\n\|[-:| ]+\|\n(?:\|.+\|\n?)+)/)
  if (!m) return null
  const lines = m[1].trim().split("\n").filter((_, i) => i !== 1)
  return lines.map(line =>
    line.replace(/^\||\|$/g, "").split("|").map(cell =>
      `"${cell.trim().replace(/"/g, '""')}"`
    ).join(",")
  ).join("\n")
}

// Bỏ các khối helper (export/csv/json) khỏi nội dung hiển thị — chúng chỉ để driver nút tải, không phải
// nội dung đọc được. Dùng khi render message trong khung chat.
export function stripExportHelperBlocks(text: string): string {
  return text
    .replace(/```export\s[\s\S]*?```/g, "")
    .replace(/```csv[\s\S]*?```/g, "")
    .replace(/```json\s*\[[\s\S]*?```/g, "")
    .trim()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement("a")
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadText(content: string, filename: string, mime: string) {
  downloadBlob(new Blob(["﻿" + content], { type: mime + ";charset=utf-8" }), filename)
}

function parseCSVRows(csv: string): string[][] {
  return csv.split("\n").filter(r => r.trim()).map(r => {
    const result: string[] = []
    let cur = "", inQ = false
    for (let i = 0; i < r.length; i++) {
      if (r[i] === '"') { inQ = !inQ }
      else if (r[i] === "," && !inQ) { result.push(cur); cur = "" }
      else cur += r[i]
    }
    result.push(cur)
    return result
  })
}

function downloadCSVAsExcel(csv: string, filename: string) {
  import("xlsx").then((XLSX) => {
    const rows = parseCSVRows(csv)
    const ws   = XLSX.utils.aoa_to_sheet(rows)
    if (rows.length) {
      ws["!cols"] = rows[0].map((_, ci) => ({
        wch: Math.min(50, Math.max(8, ...rows.map(r => String(r[ci] ?? "").length)) + 2),
      }))
    }
    ws["!freeze"] = { xSplit: 0, ySplit: 1 }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Data")
    XLSX.writeFile(wb, filename)
  }).catch(() => downloadText(csv, filename.replace(".xlsx", ".csv"), "text/csv"))
}

async function downloadPDF(contentEl: HTMLElement, title: string) {
  const { default: html2canvas } = await import("html2canvas")
  const { default: jsPDF }       = await import("jspdf")

  const clone = contentEl.cloneNode(true) as HTMLElement
  clone.style.cssText = "background:#fff;color:#000;padding:20px;max-width:750px;font-family:Arial,sans-serif"
  document.body.appendChild(clone)

  try {
    const canvas = await html2canvas(clone, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true, allowTaint: true })

    const pdf      = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageW    = pdf.internal.pageSize.getWidth()
    const pageH    = pdf.internal.pageSize.getHeight()
    const margin   = 10
    const imgW     = pageW - margin * 2
    const imgH     = (canvas.height * imgW) / canvas.width
    const pageImgH = pageH - margin * 2
    const stamp    = new Date().toLocaleDateString("vi-VN")

    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(14)
    pdf.setTextColor(0, 0, 0)
    pdf.text(title, margin, margin + 5)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.setTextColor(120, 120, 120)
    pdf.text(stamp, margin, margin + 10)
    pdf.setDrawColor(200, 200, 200)
    pdf.line(margin, margin + 13, pageW - margin, margin + 13)

    const contentTop = margin + 16
    const firstPageH = pageH - contentTop - margin
    const imgData = canvas.toDataURL("image/png")

    if (imgH <= firstPageH) {
      pdf.addImage(imgData, "PNG", margin, contentTop, imgW, imgH)
    } else {
      let yOffset = 0
      let isFirst = true
      while (yOffset < canvas.height) {
        if (!isFirst) pdf.addPage()
        const yStart   = isFirst ? contentTop : margin
        const availH   = isFirst ? firstPageH : pageImgH
        const sliceH   = Math.min(availH / imgW * canvas.width, canvas.height - yOffset)
        const tmpCanvas = document.createElement("canvas")
        tmpCanvas.width  = canvas.width
        tmpCanvas.height = sliceH
        tmpCanvas.getContext("2d")!.drawImage(canvas, 0, -yOffset)
        pdf.addImage(tmpCanvas.toDataURL("image/png"), "PNG", margin, yStart, imgW, availH)
        yOffset += sliceH
        isFirst  = false
      }
    }

    pdf.save(`${title.replace(/[^a-z0-9À-ỿ]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`)
  } finally {
    document.body.removeChild(clone)
  }
}

// Xuất Excel FULL data: server chạy lại chính câu SELECT (không giới hạn 200 dòng như ```csv của model).
async function downloadServerExcel(apiEndpoint: string, sql: string, title: string) {
  const res = await fetch(apiEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, title, format: "xlsx" }),
  })
  if (!res.ok) { alert("Xuất Excel thất bại: " + (await res.text())); return }
  downloadBlob(await res.blob(), `${title.replace(/[^a-z0-9À-ỿ]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function downloadWord(apiEndpoint: string, markdown: string, title: string) {
  const res = await fetch(apiEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown, title, format: "docx" }),
  })
  if (!res.ok) { alert("Xuất Word thất bại: " + (await res.text())); return }
  downloadBlob(await res.blob(), `${title.replace(/[^a-z0-9À-ỿ]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.docx`)
}

// ─── Thanh nút xuất file — hiện dưới message khi có ```export marker ────────────────────────────────
export function ExportBar({ content, contentRef, apiEndpoint }: {
  content: string
  contentRef: React.RefObject<HTMLDivElement | null>
  apiEndpoint: string   // "/api/creator-ai/export" (Gấu Pro) hoặc "/api/chat/export" (Bé Gấu)
}) {
  const [pdfLoading,   setPdfLoading]   = useState(false)
  const [wordLoading,  setWordLoading]  = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)

  const marker = parseExportMarker(content)
  if (!marker) return null

  const { formats, title, sql } = marker
  const stamp       = new Date().toISOString().slice(0, 10)
  const csvContent  = extractCSVBlock(content) || extractMarkdownTable(content)
  const jsonContent = extractJSONArray(content)
  const cleanForDoc = stripExportHelperBlocks(content)

  const showCSV   = formats.has("csv")   && csvContent
  const showExcel = formats.has("excel") && (csvContent || sql)
  const showJSON  = formats.has("json")  && jsonContent
  const showPDF   = formats.has("pdf")
  const showWord  = formats.has("word")

  if (!showCSV && !showExcel && !showJSON && !showPDF && !showWord) return null

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
      {showCSV && (
        <button
          onClick={() => downloadText(csvContent!, `${stamp}.csv`, "text/csv")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition-colors"
        >
          <Download size={12} /> CSV
        </button>
      )}
      {showExcel && (
        <button
          disabled={excelLoading}
          onClick={async () => {
            if (sql) {
              setExcelLoading(true)
              try { await downloadServerExcel(apiEndpoint, sql, title) }
              catch (e: unknown) { alert("Excel thất bại: " + String(e)) }
              finally { setExcelLoading(false) }
            } else {
              downloadCSVAsExcel(csvContent!, `${title.replace(/[^a-z0-9À-ỿ]+/gi, "_")}_${stamp}.xlsx`)
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {excelLoading ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Excel
        </button>
      )}
      {showJSON && (
        <button
          onClick={() => downloadText(jsonContent!, `${stamp}.json`, "application/json")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
        >
          <FileJson size={12} /> JSON
        </button>
      )}
      {showPDF && (
        <button
          disabled={pdfLoading}
          onClick={async () => {
            if (!contentRef.current) return
            setPdfLoading(true)
            try { await downloadPDF(contentRef.current, title) }
            catch (e: unknown) { alert("PDF thất bại: " + String(e)) }
            finally { setPdfLoading(false) }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          {pdfLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} PDF
        </button>
      )}
      {showWord && (
        <button
          disabled={wordLoading}
          onClick={async () => {
            setWordLoading(true)
            try { await downloadWord(apiEndpoint, cleanForDoc, title) }
            catch (e: unknown) { alert("Word thất bại: " + String(e)) }
            finally { setWordLoading(false) }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          {wordLoading ? <Loader2 size={12} className="animate-spin" /> : <FileType size={12} />} Word
        </button>
      )}
    </div>
  )
}
