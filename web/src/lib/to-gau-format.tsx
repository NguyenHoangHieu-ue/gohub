// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import React from "react"
import type { Member } from "@/lib/to-gau-types"

// Tạo màu avatar từ hash email
export function emailColor(email: string): string {
  const colors = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500",
    "bg-amber-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500",
  ]
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export function initials(name: string | null | undefined, email: string): string {
  const n = name || email
  const parts = n.split(/[\s@.]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return n.slice(0, 2).toUpperCase()
}

export function fmtTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

export function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function fmtFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// File icon by type
export function fileIcon(fileType: string | null): { icon: string; color: string } {
  if (!fileType) return { icon: "📄", color: "text-slate-500" }
  if (fileType.includes("pdf"))                                          return { icon: "📕", color: "text-red-500" }
  if (fileType.includes("sheet") || fileType.includes("excel") || fileType.includes("xlsx") || fileType.includes("csv"))
    return { icon: "📗", color: "text-emerald-600" }
  if (fileType.includes("word") || fileType.includes("docx") || fileType.includes("msword"))
    return { icon: "📘", color: "text-blue-600" }
  if (fileType.startsWith("image/"))                                    return { icon: "🖼️", color: "text-violet-500" }
  return { icon: "📄", color: "text-slate-500" }
}

// ── Render content with @mention highlight ──
export function renderContent(
  content: string,
  myEmail: string,
  members: Member[],
): React.ReactNode {
  if (!content) return null
  // Match @word (letters, digits, dot, dash, underscore)
  const parts = content.split(/(@[\w.\-]+)/g)
  return parts.map((part, i) => {
    if (!part.startsWith("@")) return part
    const handle = part.slice(1).toLowerCase()
    const myPrefix = myEmail.split("@")[0].toLowerCase()
    const myName   = members.find(m => m.user_email === myEmail)?.user_name?.toLowerCase()

    const isMe = handle === myPrefix || (myName && handle === myName.replace(/\s+/g, "").toLowerCase())
    if (isMe) {
      return (
        <span key={i} className="bg-yellow-100 text-yellow-800 font-semibold px-0.5 rounded">
          {part}
        </span>
      )
    }
    // Check if it matches any member
    const matchedMember = members.find(m => {
      const prefix = m.user_email.split("@")[0].toLowerCase()
      const uname  = (m.user_name || "").toLowerCase().replace(/\s+/g, "")
      return handle === prefix || handle === uname
    })
    if (matchedMember) {
      return (
        <span key={i} className="text-[#003B95] font-medium">
          {part}
        </span>
      )
    }
    return part
  })
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function renderMarkdown(md: string): string {
  // Bỏ YAML frontmatter, escape HTML trước khi build markup (chống XSS)
  const body = escapeHtml(md.replace(/^---[\s\S]*?---\n?/, ""))
  return body
    .replace(/^### (.+)$/gm, '<h3 class="text-[14px] font-semibold text-slate-700 mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-[15px] font-semibold text-slate-800 mt-5 mb-2 border-b border-slate-100 pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-[17px] font-bold text-slate-900 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 rounded text-[12px] font-mono">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-[#003B95] pl-3 text-slate-600 italic text-[13px] my-2">$1</blockquote>')
    .replace(/^\| (.+) \|$/gm, (line) => {
      const cells = line.split("|").filter(c => c.trim()).map(c => `<td class="px-2 py-1 text-[12px] border border-slate-200">${c.trim()}</td>`)
      return `<tr>${cells.join("")}</tr>`
    })
    .replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table class="w-full border-collapse my-3 text-[12px]">$1</table>')
    .replace(/^- (.+)$/gm, '<li class="text-[13px] text-slate-700 ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="text-[13px] text-slate-700 ml-4 list-decimal">$2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/✅/g, '<span class="text-emerald-600">✅</span>')
    .replace(/⚠️/g, '<span class="text-amber-600">⚠️</span>')
    .replace(/ℹ️/g, '<span class="text-blue-500">ℹ️</span>')
}
