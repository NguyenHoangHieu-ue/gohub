"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react"
import dynamic from "next/dynamic"
import {
  Target, Pencil, Save, XCircle, RefreshCw,
  ChevronDown, ChevronUp, Gauge,
  BarChart3, Bot, Settings,
  MessageSquare, ChevronLeft, ChevronRight, BookOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NotesDrawer, DataTable, ProgressBar, SourceBox } from "@/components/my-metrics/shared-ui"
import { EvidenceCard } from "@/components/my-metrics/evidence-card"
import { DatapoolDetailTable } from "@/components/my-metrics/datapool-detail-table"
import { SkuScanSection } from "@/components/my-metrics/sku-scan-section"
import { BegauInsightsSection } from "@/components/my-metrics/begau-insights-section"
import { LarkConfigModal } from "@/components/my-metrics/lark-config-modal"
import { fck, pct, hhmm, currentQuarter, achHigherBetter, achLowerBetter } from "@/lib/my-metrics-format"
import { DEFAULT_TARGETS, BASELINE_NOTE, WEIGHTS, OKR_GM_BASELINE_DISPLAY } from "@/lib/my-metrics-types"
import type {
  AutoMetrics, MonthStat, MonthCount, Conversation, ManualMetrics, NoteSection,
} from "@/lib/my-metrics-types"

// Biểu đồ nạp động (ssr:false) → recharts code-split khỏi bundle đầu (khớp pattern bod-charts.tsx).
const chartLoading = () => <div className="w-full h-full animate-pulse bg-white/10 rounded-xl" />
const ScoreRadarChart    = dynamic(() => import("./my-metrics-charts").then(m => m.ScoreRadarChart),    { ssr: false, loading: chartLoading })
const DatapoolTrendChart = dynamic(() => import("./my-metrics-charts").then(m => m.DatapoolTrendChart), { ssr: false, loading: chartLoading })
const BegauTrendChart    = dynamic(() => import("./my-metrics-charts").then(m => m.BegauTrendChart),    { ssr: false, loading: chartLoading })

// s183 Phase 5 (tiếp): types (AutoMetrics/MonthStat/GmStat/MonthCount/EvidenceRecord/EvidenceData/
// LarkEvent/Conversation/ManualMetrics/SkuScanItem/SkuScanData/SkuNote/DatapoolDetailItem/
// DatapoolDetailData/TopUserRow/TopicRow/QualityItem/BegauInsightsData/LarkScanResult/NoteSection) +
// hằng số (DEFAULT_TARGETS/BASELINE_NOTE/WEIGHTS/OKR_GM_BASELINE_DISPLAY) đã tách sang
// lib/my-metrics-types.ts; format helpers (fck/pct/hhmm/currentQuarter/achHigherBetter/achLowerBetter/
// uploadImage) sang lib/my-metrics-format.ts; UI dùng chung (ProgressBar/SourceBox/NotesDrawer/
// DataTable) sang components/my-metrics/shared-ui.tsx; LarkReviewPanel/EvidenceCard/
// DatapoolDetailTable/SkuScanSection/BegauInsightsSection/ScanResultBox/LarkConfigModal sang
// components/my-metrics/*.tsx. Tách cơ học, không đổi hành vi.

// ─── Main ─────────────────────────────────────────────────────────────────────

function MyMetricsInner({ canConfigLark }: { canConfigLark: boolean }) {
  const def = currentQuarter()
  const [selQ,    setSelQ]    = useState<"Q3"|"Q4">(def.q)
  const [selYear, setSelYear] = useState(def.year)
  const [auto,    setAuto]    = useState<AutoMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLarkConfig, setShowLarkConfig] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  const [convs,      setConvs]      = useState<Conversation[]>([])
  const [convTotal,  setConvTotal]  = useState(0)
  const [convPage,   setConvPage]   = useState(0)
  const [showConvs,  setShowConvs]  = useState(false)
  const [convLoad,   setConvLoad]   = useState(false)
  const [expandConv, setExpandConv] = useState<number | null>(null)
  const CONV_LIMIT = 15

  const [manual,    setManual]    = useState<ManualMetrics | null>(null)
  const [editTarget, setEditTarget] = useState(false)
  const [draftT,     setDraftT]    = useState<Partial<ManualMetrics>>({})
  const [savingT,    setSavingT]   = useState(false)

  // Summary values lifted từ card con để tính Weighted Score tổng
  const [slaAvg,    setSlaAvg]    = useState<number | null>(null)
  const [vendorAvg, setVendorAvg] = useState<number | null>(null)
  const [skuDelta,  setSkuDelta]  = useState<number | null>(null)

  const qLabel  = `${selQ}-${selYear}`
  const defT    = DEFAULT_TARGETS[selQ]

  const targets = {
    sla_hours:    manual?.target_sla_hours    || defT.sla_hours,
    sla_pct:      manual?.target_sla_pct      || defT.sla_pct,
    vendor_speed: manual?.target_vendor_speed || defT.vendor_speed,
    gm_delta:     manual?.target_gm_delta     || defT.gm_delta,
    hk3_pct:      manual?.target_hk3_pct      || defT.hk3_pct,
    begau:        manual?.target_begau         || defT.begau,
  }

  const fetchAuto = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics?quarter=${selQ}&year=${selYear}`)
    if (r.ok) setAuto(await r.json())
    setLoading(false)
  }, [selQ, selYear])

  const fetchManual = useCallback(async () => {
    const r = await fetch(`/api/analytics/my-metrics/manual?quarter=${selQ}&year=${selYear}`)
    if (r.ok) { const d = await r.json(); setManual(d) }
    else setManual(null)
  }, [selQ, selYear])

  useEffect(() => { fetchAuto(); fetchManual() }, [fetchAuto, fetchManual])

  const openEditTarget = () => {
    setDraftT({
      target_sla_hours:    targets.sla_hours,
      target_sla_pct:      targets.sla_pct,
      target_vendor_speed: targets.vendor_speed,
      target_gm_delta:     targets.gm_delta,
      target_hk3_pct:      targets.hk3_pct,
      target_begau:        targets.begau,
    })
    setEditTarget(true)
  }

  const saveTargets = async () => {
    setSavingT(true)
    const r = await fetch("/api/analytics/my-metrics/manual", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarter: selQ, year: String(selYear), ...draftT }),
    })
    if (r.ok) { await fetchManual(); setEditTarget(false) }
    setSavingT(false)
  }

  const fetchConvs = useCallback(async (page = 0) => {
    setConvLoad(true)
    const r = await fetch(`/api/analytics/my-metrics/conversations?quarter=${qLabel}&page=${page}&limit=${CONV_LIMIT}`)
    if (r.ok) {
      const j = await r.json()
      setConvs(j.rows); setConvTotal(j.total); setConvPage(page)
    }
    setConvLoad(false)
  }, [qLabel])

  useEffect(() => { if (showConvs) fetchConvs(0) }, [showConvs, fetchConvs])

  const gmDelta  = auto ? +(auto.gm.qtd_pct - auto.gm.baseline).toFixed(2) : 0
  const hk3Pct   = auto?.hk3.pct ?? 0
  const convPages = Math.ceil(convTotal / CONV_LIMIT)

  const hk3TableRows = auto?.hk3.monthly ?? []
  const begauMonthEntries = Object.entries(auto?.begau.monthly ?? {}).sort(([a], [b]) => a.localeCompare(b))

  // ── Weighted OKR Score (composite) ──
  const achSla    = achLowerBetter(slaAvg, targets.sla_hours)
  const achVendor = achLowerBetter(vendorAvg, targets.vendor_speed)
  const achSku    = skuDelta !== null ? achHigherBetter(skuDelta, targets.gm_delta) : 0
  const achHk3    = achHigherBetter(hk3Pct, targets.hk3_pct)
  const achBegau  = achHigherBetter(auto?.begau.total ?? 0, targets.begau)
  const overallScore = (
    achSla * WEIGHTS.sla + achVendor * WEIGHTS.vendor_speed + achSku * WEIGHTS.sku_gm +
    achHk3 * WEIGHTS.hk3 + achBegau * WEIGHTS.begau
  ) / 100

  // ── Dữ liệu cho chart (đều suy từ state đã fetch, không gọi API riêng) ──
  const radarData = [
    { metric: "SLA", value: Math.min(120, achSla), weight: WEIGHTS.sla, target: 100 as const },
    { metric: "Vendor Speed", value: Math.min(120, achVendor), weight: WEIGHTS.vendor_speed, target: 100 as const },
    { metric: "SKU GM", value: Math.min(120, achSku), weight: WEIGHTS.sku_gm, target: 100 as const },
    { metric: "%3HK", value: Math.min(120, achHk3), weight: WEIGHTS.hk3, target: 100 as const },
    { metric: "Bé Gấu", value: Math.min(120, achBegau), weight: WEIGHTS.begau, target: 100 as const },
  ]
  const datapoolTrend = hk3TableRows.map(m => ({
    month: m.month, pct: m.total_rev > 0 ? ((m.hk3_rev + m.bc_rev) / m.total_rev) * 100 : 0,
  }))
  const begauTrendData = begauMonthEntries.map(([month, d]) => ({ month, web: d.web, lark: d.lark }))

  // ── Nội dung Notes Drawer — mọi công thức/giải thích trước đây nằm rải rác luôn-hiện trong card ──
  const noteSections: NoteSection[] = [
    {
      id: "score", title: "Weighted OKR Score — công thức",
      body: (
        <>
          <p>Σ(đạt-%<sub>i</sub> × trọng-số<sub>i</sub>) / 100. Mỗi đạt-% cap 0–100% trước khi nhân trọng số.</p>
          <p>Trọng số 70/30 lấy đúng theo offer letter (Operational Excellence + Product Performance = 70% time-allocation, BI &amp; AI Automation = 30%); 4 chỉ số trong nhóm 70% chia đều 17.5% (offer letter không ghi trọng số riêng từng chỉ số) — sửa hằng số <code>WEIGHTS</code> trong code nếu sếp chốt trọng số khác.</p>
          <p>Radar hiển thị đạt-% từng trục tới 120% (vượt target vẫn thấy rõ) — vòng nét đứt = mốc 100%.</p>
        </>
      ),
    },
    {
      id: "status", title: "Trạng thái &amp; màu badge",
      body: (
        <>
          <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />Chờ duyệt = Bé Gấu đề xuất, chưa tính vào KPI.</p>
          <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />Verified = có bằng chứng kiểm tra được (ảnh hoặc log chat + người duyệt).</p>
          <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />Auto/Context = tính thẳng từ DB hoặc chỉ tham khảo — không phải case cần duyệt.</p>
        </>
      ),
    },
    {
      id: "sku-gm", title: "SKU Gross Margin — cách tính",
      body: (
        <>
          <p>Tự quét TOÀN BỘ SKU có đơn trong quý (không cần gắn tay) — so GM% quý này vs quý trước cho từng SKU.</p>
          <p>"Trọng điểm" = SKU nằm trong nhóm đóng góp 80% doanh thu tích luỹ (Pareto). "Mới" = SKU chưa bán quý trước, so với baseline công ty {OKR_GM_BASELINE_DISPLAY}%.</p>
          <p>KPI chính thức = weighted theo SKU trọng điểm/mới. Số "blended toàn công ty" (thẻ xám bên dưới bảng) chỉ để tham khảo bối cảnh — gộp mọi SKU nên bị nhiễu bởi channel-mix/khuyến mãi ngoài kiểm soát cá nhân.</p>
        </>
      ),
    },
    {
      id: "datapool", title: "%3HK + Datapool — cách tính",
      body: <p>Doanh thu SKU vendor 3HK Datapool hoặc BC Datapool / tổng doanh thu công ty trong quý — tính trên gohub_dw, cutoff hôm qua.</p>,
    },
    {
      id: "begau", title: "Tasks via Bé Gấu — cách tính",
      body: (
        <>
          <p>Đếm hội thoại chat có phản hồi AI dài ≥15 ký tự (loại chào hỏi/lỗi cụt), company-wide, trong quý.</p>
          {auto && auto.begau.excluded_short > 0 && <p>Đã loại {auto.begau.excluded_short} tin nhắn quá ngắn khỏi kỳ này.</p>}
          <p>Không có structured "success flag" — độ dài phản hồi là proxy, không phải thước đo chuẩn xác tuyệt đối.</p>
        </>
      ),
    },
    {
      id: "begau-insights", title: "Bé Gấu Insights — Top người dùng/chủ đề/chấm điểm",
      body: (
        <>
          <p><strong>Top người dùng</strong>: đếm số task theo tên/email trong quý, top 10.</p>
          <p><strong>Chủ đề hay hỏi</strong>: đếm tần suất từ khoá/cụm 2 từ trong câu hỏi (sau khi bỏ từ
          dừng tiếng Việt phổ biến), KHÔNG dùng AI — thuần đếm tần suất, nhanh và miễn phí nhưng chỉ bắt
          được từ khoá xuất hiện nhiều lần theo mặt chữ, không hiểu ngữ nghĩa/gộp từ đồng nghĩa.</p>
          <p><strong>Chấm điểm câu trả lời là HEURISTIC</strong> (không phải AI chấm, không phải đo
          lường đúng/sai thật): cộng điểm nếu có số liệu/có cấu trúc bảng-bullet/đủ dài, trừ điểm nếu
          quá ngắn hoặc chứa cụm "xin lỗi/chưa có thông tin/không rõ...". Dùng để LỌC NHANH các câu trả
          lời khả nghi cần soát tay, không phải kết luận cuối cùng — điểm thấp không chắc chắn là sai,
          chỉ là "đáng xem lại".</p>
        </>
      ),
    },
  ]

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px] mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-600/20">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">My OKR Metrics</h1>
            <p className="text-sm text-slate-500 font-medium italic">
              Product Operations & BI Analyst · Q3/Q4 2026 · nguồn dữ liệu minh bạch, kiểm tra được từng số
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(["Q3","Q4"] as const).map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-4 py-1.5 text-xs font-black rounded-lg transition-all",
                  selQ === q ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {q} {selYear}
              </button>
            ))}
          </div>
          <button onClick={fetchAuto} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
          </button>
          {canConfigLark && (
            <button onClick={() => setShowLarkConfig(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
              <Settings className="w-3.5 h-3.5" /> Lark Bot
            </button>
          )}
          <button onClick={openEditTarget}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Sửa Target
          </button>
          <button onClick={() => setShowNotes(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
            <BookOpen className="w-3.5 h-3.5" /> Cách tính
          </button>
        </div>
      </div>

      {showLarkConfig && <LarkConfigModal onClose={() => setShowLarkConfig(false)} />}
      {showNotes && <NotesDrawer sections={noteSections} onClose={() => setShowNotes(false)} />}

      {/* Weighted Score hero — radar 5 trục + tier tiles */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-brand-800 rounded-3xl px-6 py-6 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 items-center">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Gauge className="w-7 h-7 text-white/60" />
              <div>
                <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Weighted OKR Score — {qLabel}</p>
                <p className="text-5xl font-black tabular-nums leading-none mt-0.5">{loading ? "…" : `${overallScore.toFixed(1)}%`}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {[
                ["SLA", achSla, WEIGHTS.sla],
                ["Vendor Speed", achVendor, WEIGHTS.vendor_speed],
                ["SKU GM", achSku, WEIGHTS.sku_gm],
                ["%3HK", achHk3, WEIGHTS.hk3],
                ["Bé Gấu", achBegau, WEIGHTS.begau],
              ].map(([label, ach, w]) => {
                const achNum = ach as number
                const tier = achNum >= 100 ? "bg-emerald-400" : achNum >= 75 ? "bg-white/60" : "bg-amber-400"
                return (
                  <div key={label as string} className="bg-white/10 rounded-xl px-3 py-2 min-w-[76px] overflow-hidden relative"
                    style={{ flexGrow: w as number, flexBasis: `${(w as number) * 2}px` }}>
                    <p className="text-[9px] font-bold text-white/50 uppercase truncate">{label}</p>
                    <p className="text-lg font-black tabular-nums">{achNum.toFixed(0)}%</p>
                    <p className="text-[9px] text-white/40">w={w}%</p>
                    <div className={cn("absolute bottom-0 left-0 h-[3px]", tier)} style={{ width: `${Math.min(achNum, 100)}%` }} />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="h-56 hidden lg:block">
            <ScoreRadarChart data={radarData} />
          </div>
        </div>
      </div>

      {/* Data freshness — chỉ số cần biết ngay, còn phần "vì sao/công thức" đã dồn vào nút Cách tính */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] text-slate-500 font-medium flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>📌 <strong className="text-slate-600">Baseline T8/2026:</strong> SLA {BASELINE_NOTE.sla} · Vendor Speed {BASELINE_NOTE.vendor_speed} · SKU GM {OKR_GM_BASELINE_DISPLAY}% · Datapool {auto?.hk3.baseline ?? "…"}%</span>
        {auto && <span className="text-slate-400">🕐 {auto.data_cutoff} · tải lúc {new Date(auto.generated_at).toLocaleString("vi-VN")}</span>}
      </div>

      {/* Target edit modal */}
      {editTarget && (
        <div className="bg-white border border-brand-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-900">Sửa Target — {qLabel}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Lưu target theo từng quý, ghi đè default. {manual?.updated_at && `Sửa lần cuối ${hhmm(manual.updated_at)} bởi ${manual.updated_by}.`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditTarget(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                <XCircle className="w-3.5 h-3.5" /> Hủy
              </button>
              <button onClick={saveTargets} disabled={savingT}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {savingT ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            {([
              ["SLA — giờ (max)", "target_sla_hours",    "giờ"],
              ["SLA — compliance", "target_sla_pct",     "%"],
              ["Vendor Speed", "target_vendor_speed",    "phút"],
              ["SKU GM delta",    "target_gm_delta",     "%"],
              ["%3HK Datapool",   "target_hk3_pct",      "%"],
              ["Bé Gấu tasks/quý","target_begau",        "tasks"],
            ] as [string, keyof ManualMetrics, string][]).map(([label, field, unit]) => (
              <div key={field}>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="number" step="0.1" min={0}
                    value={(draftT[field] as number) ?? ""}
                    onChange={e => setDraftT(p => ({ ...p, [field]: parseFloat(e.target.value) || 0 }))}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <span className="text-xs text-slate-400 shrink-0">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 1. Operational Excellence ── */}
      <div>
        <SectionHeader n={1} label="Operational Excellence" note={`w=${WEIGHTS.sla + WEIGHTS.vendor_speed}%`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EvidenceCard
            metric="sla" quarter={qLabel} unit="giờ"
            targetValue={targets.sla_hours}
            title="Product Request SLA Handling Time"
            targetLabel={`≤ ${targets.sla_hours}h (${targets.sla_pct}% requests)`}
            baselineLabel={BASELINE_NOTE.sla}
            onSummary={setSlaAvg}
          />
          <EvidenceCard
            metric="vendor_speed" quarter={qLabel} unit="phút"
            targetValue={targets.vendor_speed}
            title="Rate Comparison & Vendor Selection Speed"
            targetLabel={`≤ ${targets.vendor_speed} phút/query`}
            baselineLabel={BASELINE_NOTE.vendor_speed}
            onSummary={setVendorAvg}
          />
        </div>
      </div>

      {/* ── 2. Product Performance ── */}
      <div>
        <SectionHeader n={2} label="Product Performance" note={`w=${WEIGHTS.sku_gm + WEIGHTS.hk3}%`} />
        <div className="space-y-4">
          <SkuScanSection quarter={qLabel} targetDelta={targets.gm_delta} onSummary={setSkuDelta} />

          {/* Datapool Rev (3HK + BC) % — auto */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-black text-slate-800">%Datapool Rev (3HK + BC Datapool)</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Auto</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-3xl font-black tabular-nums", loading ? "text-slate-300" : hk3Pct >= targets.hk3_pct ? "text-emerald-600" : hk3Pct >= targets.hk3_pct*0.75 ? "text-brand-600" : "text-amber-600")}>
                  {loading ? "…" : pct(hk3Pct)}
                </span>
                <span className="text-slate-400 text-sm font-bold">of revenue</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Target: {targets.hk3_pct}% · Baseline: {auto?.hk3.baseline ?? "…"}% · Delta: {hk3Pct > 0 && auto ? `${(hk3Pct-auto.hk3.baseline).toFixed(2)}%` : "…"}
              </div>
            </div>
            <div className="px-5 py-3 space-y-2">
              <ProgressBar actual={hk3Pct} target={targets.hk3_pct} />
              <div className="flex gap-4 text-[11px] text-slate-500">
                <span>Datapool Rev (tổng): <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.hk3_rev ?? 0)}</strong></span>
                <span className="pl-3 border-l border-slate-200">↳ 3HK Rev: <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.hk3_only_rev ?? 0)}</strong></span>
                <span>↳ BC Rev: <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.bc_only_rev ?? 0)}</strong></span>
                <span>Total Rev công ty: <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.total_rev ?? 0)}</strong></span>
              </div>
              {datapoolTrend.length > 1 && (
                <div className="h-40">
                  <DatapoolTrendChart data={datapoolTrend} target={targets.hk3_pct} />
                </div>
              )}
              <DataTable<MonthStat>
                rows={hk3TableRows}
                rowKey={m => m.month}
                emptyLabel="Chưa có dữ liệu tháng nào."
                columns={[
                  { key: "m", label: "Tháng", render: m => m.month },
                  { key: "pct", label: "%Datapool", align: "right", render: m => {
                    const mp = m.total_rev > 0 ? ((m.hk3_rev + m.bc_rev) / m.total_rev) * 100 : 0
                    return <span className="font-black text-slate-700">{pct(mp)}</span>
                  } },
                  { key: "hk3", label: "3HK Rev", align: "right", render: m => fck(m.hk3_rev) },
                  { key: "bc", label: "BC Rev", align: "right", render: m => fck(m.bc_rev) },
                  { key: "total", label: "Total Rev", align: "right", render: m => fck(m.total_rev) },
                ]}
              />
              <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue"
                filter="REPLACE(UPPER(TRIM(vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')" />
            </div>
          </div>

          <DatapoolDetailTable quarter={qLabel} />

          {/* SKU GM — company blended, context only (KHÔNG phải KPI chính) */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black text-slate-600">SKU Gross Margin — blended toàn công ty</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Context, không phải KPI chính</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-xl font-black", gmDelta >= 0 ? "text-slate-700" : "text-amber-600")}>
                {loading ? "…" : `${gmDelta >= 0 ? "+" : ""}${gmDelta.toFixed(2)}%`}
              </span>
              <span className="text-slate-400 text-xs">vs baseline {auto?.gm.baseline ?? "…"}% · QTD actual {auto ? pct(auto.gm.qtd_pct) : "…"} · GP {fck(auto?.gm.total_gp ?? 0)} / Rev {fck(auto?.gm.total_rev ?? 0)}</span>
            </div>
            <SourceBox type="context" table="gohub_dw · fact_fulfillment_revenue (mọi SKU)" filter="SUM(gross_profit_vnd)/SUM(fulfilled_revenue_amount_vnd), cutoff CURRENT_DATE-1" />
          </div>
        </div>
      </div>

      {/* ── 3. BI & AI Automation ── */}
      <div>
        <SectionHeader n={3} label="BI & AI Automation" note={`w=${WEIGHTS.begau}%`} />
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-black text-slate-800">Tasks Completed via Bé Gấu</span>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Auto</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-4xl font-black tabular-nums", loading ? "text-slate-300" :
                    (auto?.begau.total ?? 0) >= targets.begau ? "text-emerald-600" :
                    (auto?.begau.total ?? 0) >= targets.begau*0.75 ? "text-brand-600" : "text-slate-900")}>
                    {loading ? "…" : (auto?.begau.total ?? 0).toLocaleString()}
                  </span>
                  <span className="text-xl text-slate-400 font-bold">/ {targets.begau.toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Target {selQ}: {targets.begau} tasks · Baseline: {BASELINE_NOTE.begau_weekly}
                  {auto && auto.begau.excluded_short > 0 && ` · đã loại ${auto.begau.excluded_short} tin nhắn quá ngắn (<15 ký tự, không tính là task)`}
                </div>
              </div>
              <div className="text-right space-y-1 shrink-0">
                <div className="text-[11px] text-slate-500">Web: <strong className="text-slate-700">{auto?.begau.web ?? 0}</strong></div>
                <div className="text-[11px] text-slate-500">Lark: <strong className="text-slate-700">{auto?.begau.lark ?? 0}</strong></div>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar actual={auto?.begau.total ?? 0} target={targets.begau} />
            </div>

            {auto && Object.keys(auto.begau.by_role).length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Theo phòng ban sử dụng</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(auto.begau.by_role).sort(([,a],[,b]) => b-a).map(([role, n]) => (
                    <span key={role} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{role}: {n}</span>
                  ))}
                </div>
              </div>
            )}

            {begauTrendData.length > 1 && (
              <div className="mt-4 h-40">
                <BegauTrendChart data={begauTrendData} />
              </div>
            )}

            {begauMonthEntries.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Theo tháng</p>
                <DataTable<[string, MonthCount]>
                  rows={begauMonthEntries}
                  rowKey={([month]) => month}
                  columns={[
                    { key: "m", label: "Tháng", render: ([month]) => month },
                    { key: "total", label: "Total", align: "right", render: ([, d]) => <span className="font-black">{d.total}</span> },
                    { key: "web", label: "Web", align: "right", render: ([, d]) => d.web },
                    { key: "lark", label: "Lark", align: "right", render: ([, d]) => d.lark },
                  ]}
                />
              </div>
            )}
            <SourceBox type="auto" table="Supabase · app_usage_events"
              filter="event_type='chat' AND ai_response IS NOT NULL AND length(trim(ai_response)) >= 15 · Lark: user_email LIKE 'lark:%'" />

            <BegauInsightsSection quarter={qLabel} />

            <div className="mt-4 border-t border-slate-100 pt-4">
              <button onClick={() => setShowConvs(v => !v)}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-brand-600 transition-colors">
                <MessageSquare className="w-4 h-4" />
                {showConvs ? "Ẩn" : "Xem"} danh sách cuộc hội thoại được tính ({convTotal > 0 ? convTotal : "…"})
                {showConvs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showConvs && (
                <div className="mt-3 space-y-2">
                  {convLoad && <div className="text-xs text-slate-400 text-center py-4"><RefreshCw className="w-4 h-4 animate-spin mx-auto" /></div>}
                  {!convLoad && convs.map(c => (
                    <div key={c.id} className="border border-slate-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandConv(expandConv === c.id ? null : c.id)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 tracking-wide">
                              {c.channel}
                            </span>
                            <span className="text-[10px] text-slate-400">{c.user}</span>
                            <span className="text-[10px] text-slate-400 ml-auto">{hhmm(c.created_at)}</span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 truncate">{c.user_message}</p>
                        </div>
                        {expandConv === c.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />}
                      </button>
                      {expandConv === c.id && (
                        <div className="px-4 pb-3 space-y-2 border-t border-slate-100">
                          <div className="bg-slate-50 rounded-lg p-2.5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">User</p>
                            <p className="text-xs text-slate-700">{c.user_message}</p>
                          </div>
                          <div className="bg-brand-50 rounded-lg p-2.5">
                            <p className="text-[10px] font-black text-brand-600 uppercase tracking-wider mb-1">Bé Gấu</p>
                            <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.ai_response}{c.ai_response?.length >= 400 ? "…" : ""}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {convPages > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button disabled={convPage === 0} onClick={() => fetchConvs(convPage-1)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-bold text-slate-600">{convPage+1} / {convPages}</span>
                      <button disabled={convPage >= convPages-1} onClick={() => fetchConvs(convPage+1)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ n, label, note }: { n: number; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">{n}</span>
      <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">{label}</h2>
      {note && <span className="text-slate-400 font-normal normal-case text-xs">{note}</span>}
    </div>
  )
}

export default function MyMetricsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [role, setRole] = useState<string | null>(null)
  useEffect(() => {
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setAllowed(d?.my_metrics_enabled === true)
      setRole(d?.role ?? null)
    }).catch(() => setAllowed(false))
  }, [])
  if (allowed === null) return null
  if (!allowed) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-slate-400 text-sm">Bạn không có quyền truy cập trang này.</p>
    </div>
  )
  return <Suspense><MyMetricsInner canConfigLark={role === "admin" || role === "creator"} /></Suspense>
}
