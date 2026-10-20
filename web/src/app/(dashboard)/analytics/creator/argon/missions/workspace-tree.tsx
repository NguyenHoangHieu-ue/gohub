"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, Folder, FilePlus2, Link2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtBytes } from "../argon-types"
import type { TreeNode } from "./mission-types"

// Cây workspace của sứ mệnh. Thư mục là ảo (suy từ đường dẫn). "sources/" chỉ liệt kê nguồn đã gắn từ Kho nguồn, bấm để mở trong Kho nguồn.
export function WorkspaceTree({ tree, selected, linked, onSelect, onCreate }: {
  tree: TreeNode[]
  selected: string | null
  linked: { id: string; name: string }[]
  onSelect: (path: string) => void
  onCreate: (path: string) => void
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [newPath, setNewPath] = useState("")
  const toggle = (p: string) => setClosed(prev => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n })

  function submit() {
    const p = newPath.trim()
    if (!p) return
    onCreate(p); setNewPath(""); setAdding(false)
  }

  const row = (n: TreeNode, depth: number): React.ReactNode => {
    const pad = { paddingLeft: 8 + depth * 14 }
    if (n.type === "dir") {
      const open = !closed.has(n.path)
      return (
        <li key={n.path}>
          <button type="button" onClick={() => toggle(n.path)} style={pad} className="w-full flex items-center gap-1.5 py-1 pr-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 rounded">
            {open ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
            <Folder size={13} className="text-violet-500 shrink-0" /><span className="truncate">{n.name}/</span>
            <span className="ml-auto text-[10px] text-gray-400">{n.children?.length ? n.children.length : ""}</span>
          </button>
          {open && <ul>{n.children?.map(c => row(c, depth + 1))}</ul>}
        </li>
      )
    }
    return (
      <li key={n.path}>
        <button type="button" onClick={() => onSelect(n.path)} style={pad} aria-current={selected === n.path}
          className={cn("w-full flex items-center gap-1.5 py-1 pr-2 text-sm rounded", selected === n.path ? "bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200" : "text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700")}>
          <FileText size={13} className="text-gray-400 shrink-0" /><span className="truncate">{n.name}</span>
          {n.author === "argon" && <span className="text-[9px] px-1 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">Argon</span>}
          <span className="ml-auto text-[10px] text-gray-400 shrink-0">{fmtBytes(n.size ?? null)}</span>
        </button>
      </li>
    )
  }

  const dirs = tree.filter(n => n.type === "dir"), files = tree.filter(n => n.type === "file")
  return (
    <div className="text-sm">
      <div className="flex items-center px-2 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">Workspace</span>
        <button type="button" onClick={() => setAdding(v => !v)} title="Tạo file mới" className="ml-auto text-gray-500 hover:text-violet-600"><FilePlus2 size={14} /></button>
      </div>
      {adding && (
        <div className="px-2 pb-2 flex gap-1">
          <input autoFocus value={newPath} onChange={e => setNewPath(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false) }}
            placeholder="notes/ghi-chu.md" aria-label="Đường dẫn file mới"
            className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded bg-transparent text-gray-800 dark:text-slate-100" />
          <button type="button" onClick={submit} className="px-2 text-xs bg-violet-600 text-white rounded">Tạo</button>
        </div>
      )}
      <ul>
        <li>
          <div className="flex items-center gap-1.5 py-1 px-2 text-sm text-gray-700 dark:text-slate-200"><Link2 size={13} className="text-violet-500" />sources/<span className="ml-auto text-[10px] text-gray-400">{linked.length || ""}</span></div>
          {linked.length === 0
            ? <div className="pl-7 pr-2 pb-1 text-[11px] text-gray-400">Chưa gắn nguồn nào.</div>
            : <ul>{linked.map(s => <li key={s.id} className="pl-7 pr-2 py-0.5 text-xs text-gray-600 dark:text-slate-300 truncate" title={s.name}>{s.name}</li>)}</ul>}
        </li>
        {dirs.map(n => row(n, 0))}
        {files.map(n => row(n, 0))}
      </ul>
    </div>
  )
}
