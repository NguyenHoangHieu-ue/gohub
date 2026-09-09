"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { B2CPerformance } from "@/components/b2c-performance"
import { B2CAdvancedDashboard } from "@/components/b2c-advanced-dashboard"
import { B2CMetric } from "@/components/b2c-metric"

// Default = Advanced (executive rolling-table dashboard, giống mockup).
// Performance = intel-main style channel breakdown. Metric = YTD table Web+App.
export default function B2CPage() {
  const [view, setView] = useState<"advanced" | "main" | "metric">("advanced")

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 lg:px-8 pt-4 bg-slate-50">
        <button
          onClick={() => setView("advanced")}
          className={cn(
            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
            view === "advanced" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Advanced
        </button>
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
          onClick={() => setView("metric")}
          className={cn(
            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
            view === "metric" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          Metric
        </button>
      </div>
      {view === "advanced" ? <B2CAdvancedDashboard /> : view === "main" ? <B2CPerformance /> : <B2CMetric />}
    </div>
  )
}
