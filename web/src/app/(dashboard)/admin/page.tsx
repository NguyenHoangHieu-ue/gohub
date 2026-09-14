"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Key, Settings, FileSpreadsheet, Gift, Clock, Shield } from "lucide-react"
import { useRoleGuard } from "@/lib/use-role-guard"

type Tab = "settings" | "template" | "promotions" | "scheduled" | "ref-import" | "api-keys"

// Tách khỏi 1 file 2120 dòng (s196+21, quyết định Hiếu 2026-09-14 — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi) — mỗi tab đã tự thân là 1 component riêng biệt trong file cũ,
// chỉ cần tách file + nạp qua next/dynamic (code-split, giống pattern recharts s196+21).
const tabLoading = () => <div className="text-sm text-gray-400 py-4">Đang tải...</div>
const SettingsTab   = dynamic(() => import("./settings-tab"),    { loading: tabLoading })
const TemplateTab   = dynamic(() => import("./template-tab"),    { loading: tabLoading })
const PromotionsTab = dynamic(() => import("./promotions-tab"),  { loading: tabLoading })
const ScheduledTab  = dynamic(() => import("./scheduled-tab"),   { loading: tabLoading })
const RefImportTab  = dynamic(() => import("./ref-import-tab"),  { loading: tabLoading })
const ApiKeysTab    = dynamic(() => import("./api-keys-tab"),    { loading: tabLoading })

export default function AdminPage() {
  // Role TƯƠI từ DB (không dùng JWT stale) → admin vừa được cấp quyền vào được ngay, khỏi re-login.
  const { ready } = useRoleGuard(["admin", "creator"])
  if (!ready) return null

  return <AdminPanel />
}

const VALID_TABS: Tab[] = ["settings", "template", "promotions", "scheduled", "ref-import", "api-keys"]

function AdminPanel() {
  const [tab, setTab]       = useState<Tab>("settings")
  // Cho phép deep-link tab qua URL (?tab=template)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab")
    if (t && VALID_TABS.includes(t as Tab)) setTab(t as Tab)
  }, [])
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
    settings:    { label: "Cài đặt",        icon: <Settings        size={15} /> },
    template:    { label: "Tạo template",  icon: <FileSpreadsheet size={15} /> },
    promotions:  { label: "Khuyến mãi",   icon: <Gift            size={15} /> },
    scheduled:   { label: "Lịch Lark",    icon: <Clock           size={15} /> },
    "ref-import": { label: "Cập nhật dữ liệu", icon: <FileSpreadsheet size={15} /> },
    "api-keys":   { label: "API bên ngoài",   icon: <Key             size={15} /> },
  }
  // Nhóm tab — mỗi tab 1-click, gọn + responsive (icon-only trên mobile)
  const TAB_GROUPS: { label: string; tabs: Tab[] }[] = [
    { label: "Hệ thống", tabs: ["settings", "api-keys"] },
    { label: "Công cụ",  tabs: ["template", "promotions", "scheduled"] },
    { label: "Dữ liệu",  tabs: ["ref-import"] },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Shield size={18} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100 leading-tight">Quản Trị Hệ Thống</h1>
          <p className="text-xs text-gray-500 leading-tight">{TAB_META[tab].label}</p>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm ${
          message.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* Tab bar — 3 cụm segmented có nhãn (chunking), mỗi tab 1-click; icon-only trên mobile */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {TAB_GROUPS.map(group => (
          <div key={group.label} className="flex items-center gap-1.5">
            <span className="hidden lg:inline text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{group.label}</span>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {group.tabs.map(id => (
              <button
                key={id}
                onClick={() => setTab(id)}
                title={TAB_META[id].label}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  tab === id
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:text-slate-200"
                }`}
              >
                {TAB_META[id].icon}
                <span className="hidden md:inline">{TAB_META[id].label}</span>
              </button>
            ))}
            </div>
          </div>
        ))}
      </div>

      {tab === "settings"     && <SettingsTab     onNotify={notify} />}
      {tab === "template"     && <TemplateTab     onNotify={notify} />}
      {tab === "promotions"   && <PromotionsTab   onNotify={notify} />}
      {tab === "scheduled"    && <ScheduledTab    onNotify={notify} />}
      {tab === "ref-import"   && <RefImportTab    onNotify={notify} />}
      {tab === "api-keys"     && <ApiKeysTab       onNotify={notify} />}
    </div>
  )
}
