"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { B2CPerformance } from "@/components/b2c-performance"
import { B2CAdvancedDashboard } from "@/components/b2c-advanced-dashboard"

// B2C-2b-iii: view chính = port intel B2CPerformance. Admin có thêm nút "Advanced" → bật tab phụ =
// dashboard tùy biến cũ (GA4/leads/spend). Non-admin chỉ thấy view chính.
export default function B2CPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"
  const [view, setView] = useState<"main" | "advanced">("main")

  if (!isAdmin) return <B2CPerformance />

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 lg:px-8 pt-4 bg-slate-50">
        <button
          onClick={() => setView("main")}
          className={cn(
            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
            view === "main" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Performance
        </button>
        <button
          onClick={() => setView("advanced")}
          className={cn(
            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
            view === "advanced" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Advanced
        </button>
      </div>
      {view === "main" ? <B2CPerformance /> : <B2CAdvancedDashboard />}
    </div>
  )
}
