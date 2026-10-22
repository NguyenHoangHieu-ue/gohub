"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, FileSpreadsheet, FileText, File as FileIcon, FolderOpen, Folder, FolderPlus, Image as ImageIcon, Inbox, Layers, Mail, MessagesSquare, Pencil, Pin, Search, StickyNote, Trash2, Link2, Film, Music, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FolderRow, KhoSource } from "@/lib/argon/kho-pure"
import { fmtBytes, fmtTokens } from "../argon-types"

// Cột trái của Kho: dạng "drive" — thư mục lồng nhau, file nằm trong thư mục, kéo file thả vào thư mục để chuyển.
export type TreeSel = { kind: "all" } | { kind: "loose" } | { kind: "folder"; id: string }

function iconFor(s: KhoSource) {
  const m = s.mime ?? ""
  if (s.kind === "mail") return Mail
  if (s.kind === "note") return StickyNote
  if (s.kind === "lark") return Link2
  if (m.includes("spreadsheet") || m.includes("csv") || /\.xlsx?$/i.test(s.name)) return FileSpreadsheet
  if (m.startsWith("image/")) return ImageIcon
  if (m.startsWith("video/")) return Film
  if (m.startsWith("audio/")) return Music
  if (m === "application/pdf" || /\.docx?$/i.test(s.name)) return FileText
  return FileIcon
}
const isThread = (s: KhoSource) => s.kind === "note" && /thread/i.test(s.tags.join(" "))

export function KhoTree({ folders, sources, sel, setSel, onOpen, onMove, onFolder, onPin, onRemove, onAsk }: {
  folders: FolderRow[]; sources: KhoSource[]; sel: TreeSel; setSel: (s: TreeSel) => void
  onOpen: (s: KhoSource) => void
  onMove: (ids: string[], folderId: string | null) => Promise<void>
  onFolder: (a: { type: "create"; path: string } | { type: "rename"; id: string; name: string } | { type: "delete"; id: string }) => Promise<void>
  onPin: (s: KhoSource) => void
  onRemove: (s: KhoSource) => void
  onAsk: (text: string) => void
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [over, setOver] = useState<string | null>(null)
  const byFolder = useMemo(() => {
    const m = new Map<string | null, KhoSource[]>()
    for (const s of sources) { const k = s.folder_id; (m.get(k) ?? m.set(k, []).get(k)!).push(s) }
    return m
  }, [sources])
  const children = (parent: string | null) => folders.filter(f => f.parent_id === parent).sort((a, b) => a.name.localeCompare(b.name, "vi"))
  const total = (id: string): number => (byFolder.get(id)?.length ?? 0) + children(id).reduce((n, f) => n + total(f.id), 0)
  const needle = q.trim().toLowerCase()
  const found = needle ? sources.filter(s => `${s.name} ${s.tags.join(" ")} ${s.digest?.summary ?? ""}`.toLowerCase().includes(needle)).slice(0, 80) : []

  const drop = (e: React.DragEvent, folderId: string | null, key: string) => {
    e.preventDefault(); setOver(null)
    const ids = (e.dataTransfer.getData("text/argon-sources") || "").split(",").filter(Boolean)
    if (ids.length) void onMove(ids, folderId)
    void key
  }
  const dropProps = (folderId: string | null, key: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(key) },
    onDragLeave: () => setOver(o => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => drop(e, folderId, key),
  })

  function FileRow({ s, depth }: { s: KhoSource; depth: number }) {
    const Icon = isThread(s) ? MessagesSquare : iconFor(s)
    return (
      <div draggable onDragStart={e => e.dataTransfer.setData("text/argon-sources", s.id)} onClick={() => onOpen(s)}
        style={{ paddingLeft: 8 + depth * 14 }} title={s.digest?.summary || s.name}
        className={cn("group flex items-center gap-1.5 pr-1.5 py-1 rounded-md cursor-pointer text-[13px] hover:bg-gray-50 dark:hover:bg-slate-700/60", !s.enabled && "opacity-50")}>
        <Icon size={13} className="shrink-0 text-gray-400" />
        <span className="truncate flex-1">{s.name}</span>
        {s.pinned && <Pin size={11} className="text-violet-500 shrink-0" />}
        <span className="text-[10.5px] text-gray-400 shrink-0 group-hover:hidden">{s.tokens ? fmtTokens(s.tokens) : fmtBytes(s.size_bytes)}</span>
        <button type="button" onClick={e => { e.stopPropagation(); onPin(s) }} className="hidden group-hover:block text-gray-400 hover:text-violet-600" title={s.pinned ? "Bỏ ghim" : "Ghim: luôn nằm sẵn trong ngữ cảnh của Argon"} aria-label="Ghim"><Pin size={12} /></button>
        <button type="button" onClick={e => { e.stopPropagation(); onRemove(s) }} className="hidden group-hover:block text-gray-400 hover:text-red-600" title="Xoá" aria-label="Xoá"><Trash2 size={12} /></button>
      </div>
    )
  }

  function FolderNode({ f, depth }: { f: FolderRow; depth: number }) {
    const isOpen = open[f.id] ?? depth === 0
    const files = byFolder.get(f.id) ?? []
    const kids = children(f.id)
    return (
      <div>
        <div {...dropProps(f.id, f.id)} style={{ paddingLeft: 4 + depth * 14 }}
          className={cn("group flex items-center gap-1 pr-1.5 py-1 rounded-md cursor-pointer text-[13px] font-medium", sel.kind === "folder" && sel.id === f.id ? "bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200" : "hover:bg-gray-50 dark:hover:bg-slate-700/60", over === f.id && "ring-2 ring-violet-400")}
          onClick={() => { setOpen(o => ({ ...o, [f.id]: !isOpen })); setSel({ kind: "folder", id: f.id }) }}>
          {isOpen ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
          {isOpen ? <FolderOpen size={14} className="text-amber-500 shrink-0" /> : <Folder size={14} className="text-amber-500 shrink-0" />}
          <span className="truncate flex-1">{f.name}</span>
          <span className="text-[10.5px] text-gray-400 font-normal group-hover:hidden">{total(f.id)}</span>
          <span className="hidden group-hover:flex items-center gap-1.5 text-gray-400">
            <button type="button" title="Nhờ Argon tóm tắt thư mục này" aria-label="Tóm tắt" onClick={e => { e.stopPropagation(); onAsk(`Tóm tắt thư mục "${f.name}": có những tài liệu gì, điểm chính và điểm cần lưu ý.`) }} className="hover:text-violet-600"><Sparkles size={12} /></button>
            <button type="button" title="Thêm thư mục con" aria-label="Thêm thư mục con" onClick={e => { e.stopPropagation(); const n = prompt(`Thư mục con trong "${f.name}"`)?.trim(); if (n) void onFolder({ type: "create", path: `${pathOf(f)}/${n}` }) }} className="hover:text-violet-600"><FolderPlus size={12} /></button>
            <button type="button" title="Đổi tên" aria-label="Đổi tên" onClick={e => { e.stopPropagation(); const n = prompt("Tên mới", f.name)?.trim(); if (n && n !== f.name) void onFolder({ type: "rename", id: f.id, name: n }) }} className="hover:text-violet-600"><Pencil size={12} /></button>
            <button type="button" title="Xoá thư mục (nguồn bên trong về Chưa phân loại)" aria-label="Xoá" onClick={e => { e.stopPropagation(); if (confirm(`Xoá thư mục "${f.name}"? Nguồn bên trong về Chưa phân loại.`)) void onFolder({ type: "delete", id: f.id }) }} className="hover:text-red-600"><Trash2 size={12} /></button>
          </span>
        </div>
        {isOpen && <>
          {kids.map(k => <FolderNode key={k.id} f={k} depth={depth + 1} />)}
          {files.map(s => <FileRow key={s.id} s={s} depth={depth + 1} />)}
        </>}
      </div>
    )
  }
  const pathOf = (f: FolderRow): string => { const out: string[] = []; for (let c: FolderRow | undefined = f, g = 0; c && g < 6; c = folders.find(x => x.id === c!.parent_id), g++) out.unshift(c.name); return out.join("/") }
  const loose = byFolder.get(null) ?? []

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-2 border-b border-gray-200 dark:border-slate-700 space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên, nhãn, tóm tắt…" aria-label="Tìm trong Kho"
            className="w-full pl-8 pr-2 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-slate-600 bg-transparent focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <button type="button" onClick={() => { const n = prompt("Tên thư mục mới (gõ Vendor/3HK để tạo thư mục lồng nhau)")?.trim(); if (n) void onFolder({ type: "create", path: n }) }}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[13px] rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40"><FolderPlus size={13} />Thư mục mới</button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {needle ? (
          <div>
            <div className="px-2 py-1 text-[11px] text-gray-500">{found.length} kết quả</div>
            {found.map(s => <FileRow key={s.id} s={s} depth={0} />)}
          </div>
        ) : <>
          <div onClick={() => setSel({ kind: "all" })} className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[13px] font-medium", sel.kind === "all" ? "bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200" : "hover:bg-gray-50 dark:hover:bg-slate-700/60")}>
            <Layers size={14} className="text-violet-500" />Tất cả<span className="ml-auto text-[10.5px] text-gray-400 font-normal">{sources.length}</span>
          </div>
          {children(null).map(f => <FolderNode key={f.id} f={f} depth={0} />)}
          <div {...dropProps(null, "loose")} onClick={() => setSel({ kind: "loose" })}
            className={cn("mt-1 flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[13px] font-medium", sel.kind === "loose" ? "bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200" : "hover:bg-gray-50 dark:hover:bg-slate-700/60", over === "loose" && "ring-2 ring-violet-400")}>
            <Inbox size={14} className="text-gray-400" />Chưa phân loại<span className="ml-auto text-[10.5px] text-gray-400 font-normal">{loose.length}</span>
          </div>
          {(sel.kind === "loose" || sel.kind === "all") && loose.slice(0, 200).map(s => <FileRow key={s.id} s={s} depth={1} />)}
          {!folders.length && !sources.length && <div className="text-xs text-gray-400 text-center py-8 px-3 leading-relaxed">Kho còn trống. Kéo file vào khung bên phải để bắt đầu.</div>}
        </>}
      </div>
    </div>
  )
}
