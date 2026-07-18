"use client"

// Wave 0.3 — Command Palette (⌘K / Ctrl+K).
// Điều hướng mọi tab theo quyền + hành động nhanh + tra cứu (SKU live, Note/Wiki, nước, đơn).
// Mount 1 lần ở dashboard layout. Esc đóng, ↑↓ chọn, Enter nhảy.

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  Search, CornerDownLeft, ArrowUp, ArrowDown, Package, StickyNote, Globe, ClipboardList,
  Gift, Truck, Terminal, Command as CommandIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { visibleNavForPalette, type PaletteNavItem } from "@/lib/nav"

interface Cmd { id: string; label: string; sub?: string; icon: LucideIcon; group: string; run: () => void }

function useHotkey(onOpen: () => void) {
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault(); onOpen()
      }
    }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onOpen])
}

export function CommandPalette() {
  const router = useRouter()
  const { data: session } = useSession()
  const role = session?.user?.role || "staff"
  const username = session?.user?.username || ""

  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState("")
  const [sel, setSel]     = useState(0)
  const [nav, setNav]     = useState<PaletteNavItem[]>([])
  const [permLoaded, setPermLoaded] = useState(false)
  const [skuHits, setSkuHits] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const openPalette = useCallback(() => setOpen(true), [])
  useHotkey(openPalette)

  // Mở từ nút "Tìm nhanh" ở TopBar (dispatch event) — không cần chia sẻ state.
  useEffect(() => {
    const h = () => setOpen(true)
    window.addEventListener("gohub:open-palette", h)
    return () => window.removeEventListener("gohub:open-palette", h)
  }, [])

  // Nạp quyền 1 lần (khi mở lần đầu) → dựng danh sách nav theo quyền (mirror sidebar).
  useEffect(() => {
    if (!open || permLoaded || !username) return
    Promise.all([
      fetch("/api/user/me", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/config/role-permissions", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/config/tab-visibility", { cache: "no-store" }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([me, perms, vis]) => {
      const r = me?.role ?? role
      setNav(visibleNavForPalette({
        role: r,
        allowedAnalytics: me?.allowed_analytics != null ? String(me.allowed_analytics).split(",").filter(Boolean) : null,
        allowedTabs:      me?.allowed_tabs       != null ? String(me.allowed_tabs).split(",").filter(Boolean) : null,
        rolePerms:        perms ?? null,
        hiddenTabs:       new Set<string>((vis as Record<string, string[]>)?.[r] ?? []),
      }))
      setPermLoaded(true)
    })
  }, [open, permLoaded, username, role])

  // Reset khi đóng / focus input khi mở
  useEffect(() => {
    if (open) { setQuery(""); setSel(0); setSkuHits([]); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  // Live SKU search (debounce) — nhìn giống mã SKU / có chữ-số ≥ 2 ký tự
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setSkuHits([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/skus?search=${encodeURIComponent(q)}&page=1`, { cache: "no-store" })
        if (!r.ok) return
        const d = await r.json()
        setSkuHits((d.data ?? []).slice(0, 5).map((x: any) => x.sku_code).filter(Boolean))
      } catch { setSkuHits([]) }
    }, 220)
    return () => clearTimeout(t)
  }, [query])

  const go = useCallback((href: string) => { setOpen(false); router.push(href) }, [router])

  // Dựng danh sách lệnh theo query
  const commands = useMemo<Cmd[]>(() => {
    const q = query.trim().toLowerCase()
    const list: Cmd[] = []

    // 1. Điều hướng (lọc theo query)
    for (const n of nav) {
      if (!q || n.label.toLowerCase().includes(q) || n.group.toLowerCase().includes(q)) {
        list.push({ id: `nav:${n.href}`, label: n.label, sub: n.group, icon: n.icon, group: n.group === "Điều hướng" ? "Điều hướng" : "Analytics", run: () => go(n.href) })
      }
    }

    // 2. Hành động nhanh
    const actions: Cmd[] = [
      { id: "a:promo", label: "Tạo Promotion",  icon: Gift,          group: "Hành động", run: () => go("/promotions") },
      { id: "a:note",  label: "Mở Note / KB",   icon: StickyNote,    group: "Hành động", run: () => go("/info") },
      { id: "a:ncc",   label: "Import NCC",     icon: Truck,         group: "Hành động", run: () => go("/ncc") },
      { id: "a:sql",   label: "SQL Explorer",   icon: Terminal,      group: "Hành động", run: () => go("/analytics/sql") },
    ]
    for (const a of actions) if (!q || a.label.toLowerCase().includes(q)) list.push(a)

    // 3. Live SKU results
    for (const sku of skuHits) {
      list.push({ id: `sku:${sku}`, label: sku, sub: "Mở trong System SKUs", icon: Package, group: "SKU", run: () => go(`/skus?search=${encodeURIComponent(sku)}`) })
    }

    // 4. Deep-link tra cứu (khi có query)
    if (q) {
      const raw = query.trim()
      list.push({ id: "s:sku",     label: `Tìm SKU "${raw}"`,        icon: Package,       group: "Tra cứu", run: () => go(`/skus?search=${encodeURIComponent(raw)}`) })
      list.push({ id: "s:note",    label: `Tìm trong Note/Wiki "${raw}"`, icon: StickyNote, group: "Tra cứu", run: () => go(`/info?search=${encodeURIComponent(raw)}`) })
      list.push({ id: "s:country", label: `Tìm nước "${raw}"`,       icon: Globe,         group: "Tra cứu", run: () => go(`/countries?search=${encodeURIComponent(raw)}`) })
      list.push({ id: "s:order",   label: `Tìm đơn/khách "${raw}"`,  icon: ClipboardList, group: "Tra cứu", run: () => go(`/analytics/orders?search=${encodeURIComponent(raw)}`) })
    }

    return list
  }, [query, nav, skuHits, go])

  useEffect(() => { setSel(0) }, [query])

  // Bàn phím trong palette
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false) }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, commands.length - 1)) }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === "Enter")     { e.preventDefault(); commands[sel]?.run() }
  }

  // Cuộn item đang chọn vào tầm nhìn
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [sel])

  if (!open) return null

  // Nhóm hiển thị theo thứ tự xuất hiện
  const groupsOrder: string[] = []
  for (const c of commands) if (!groupsOrder.includes(c.group)) groupsOrder.push(c.group)

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-slate-700 overflow-hidden" onKeyDown={onKey}>
        {/* Ô tìm */}
        <div className="flex items-center gap-2 px-4 border-b border-gray-100 dark:border-slate-800">
          <Search size={17} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Tìm trang, hành động, SKU, nước…"
            className="flex-1 py-3.5 text-sm bg-transparent outline-none text-gray-800 dark:text-slate-100 placeholder:text-gray-400"
          />
          <kbd className="text-[10px] font-semibold text-gray-400 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Kết quả */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {commands.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Không có kết quả cho "{query}"</p>
          ) : groupsOrder.map(gr => (
            <div key={gr}>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{gr}</p>
              {commands.map((c, i) => c.group === gr && (
                <button
                  key={c.id} data-idx={i}
                  onMouseEnter={() => setSel(i)} onClick={() => c.run()}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${i === sel ? "bg-brand-50 dark:bg-slate-800" : "hover:bg-gray-50 dark:hover:bg-slate-800/60"}`}
                >
                  <c.icon size={15} className={i === sel ? "text-brand-600 dark:text-brand-300" : "text-gray-400"} />
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm truncate ${i === sel ? "text-brand-800 dark:text-brand-200 font-medium" : "text-gray-700 dark:text-slate-200"}`}>{c.label}</span>
                    {c.sub && <span className="block text-[11px] text-gray-400 truncate">{c.sub}</span>}
                  </span>
                  {i === sel && <CornerDownLeft size={13} className="text-brand-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer gợi ý phím */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 dark:border-slate-800 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> di chuyển</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} /> chọn</span>
          <span className="flex items-center gap-1 ml-auto"><CommandIcon size={11} /> K để mở</span>
        </div>
      </div>
    </div>
  )
}
