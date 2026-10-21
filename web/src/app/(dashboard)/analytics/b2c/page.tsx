"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { B2CPerformance } from "@/components/b2c-performance"
import { B2CAdvancedDashboard } from "@/components/b2c-advanced-dashboard"
import { B2CMetric } from "@/components/b2c-metric"
import { B2CManageCosts } from "@/components/b2c-manage-costs"
import { useAnalyticsAccess } from "@/lib/use-analytics-access"

// Default = Advanced (executive rolling-table dashboard, giống mockup).
// Performance = intel-main style channel breakdown. Metric = YTD table Web+App.
export default function B2CPage() {
  const [view, setView] = useState<"advanced" | "main" | "metric" | "costs">("advanced")
  // "Chi phí & Target" = trang Manage Costs cũ, chỉ hiện cho người có quyền tab "targets" như trước.
  const canCosts = useAnalyticsAccess("targets")

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 lg:px-8 pt-4 bg-slate-50">
        <button
          onClick={() => setView("advanced")}
          className={cn(
            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
            view === "advanced" ? "bg-brand-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Advanced
        </button>
        <button
          onClick={() => setView("main")}
          className={cn(
            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
            view === "main" ? "bg-brand-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Performance
        </button>
        <button
          onClick={() => setView("metric")}
          className={cn(
            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
            view === "metric" ? "bg-brand-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Metric
        </button>
        {canCosts && (
          <button
            onClick={() => setView("costs")}
            className={cn(
              "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
              view === "costs" ? "bg-brand-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            Chi phí &amp; Target
          </button>
        )}
      </div>
      {view === "advanced" ? <B2CAdvancedDashboard /> : view === "main" ? <B2CPerformance /> : view === "costs" && canCosts ? <B2CManageCosts /> : <B2CMetric />}
    </div>
  )
}
