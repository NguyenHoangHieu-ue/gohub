"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  ExternalLink, Link2, Plus, Trash2, UserPlus, Shield,
  RefreshCw, BookmarkPlus, Copy, Check, AlertTriangle, Clock,
  TrendingUp, Database, ChevronDown, ChevronRight,
} from "lucide-react"
import { useToast } from "@/components/toast"

const PORTALS = [
  { id: "commission", name: "Commission Analytics", desc: "Báo cáo hoa hồng affiliate.", url: "https://banhang.shopee.vn/portal/web-seller-affiliate/commission_analytics" },
  { id: "affiliate",  name: "Affiliate Analytics",  desc: "Hiệu suất affiliate: clicks, conversions.", url: "https://banhang.shopee.vn/portal/web-seller-affiliate/affiliate_analytics" },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface Metrics    { affiliates: number; itemsSold: number; orderAmount: number; estCommission: number }
interface MonthEntry { month: string; metrics: Metrics | null }
interface Dataset    { variables: Record<string, unknown>; data: unknown; at: number }
interface CachedData { monthly: MonthEntry[] | null; datasets: Record<string, Dataset> | null; metrics?: Metrics | null; synced_at: string }
interface PortalUser { username: string; name: string | null; email: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────
const num   = (n: number | string | null | undefined) => (parseFloat(String(n ?? 0)) || 0).toLocaleString("vi-VN")
const vnd   = (n: number | string | null | undefined) => num(n) + " ₫"
const fmtDt = (iso: string) => new Date(iso).toLocaleString("vi-VN")
const fmtMonth = (m: string) => { const [y, mo] = m.split("-"); return `T${parseInt(mo)}/${y}` }

// Format 1 ô của bảng động theo tên cột
function fmtCell(key: string, v: unknown): string {
  if (v == null || v === "") return "—"
  if (typeof v === "object") return JSON.stringify(v)
  if (typeof v === "boolean") return v ? "✓" : "✗"
  const n = Number(v)
  const isNum = !isNaN(n) && typeof v !== "boolean"
  if (isNum && /rate|ratio|pct|percent/i.test(key)) return n <= 1 ? (n * 100).toFixed(1) + "%" : n.toFixed(1) + "%"
  if (isNum && /amount|commission|gmv|revenue|sales|price|value|income/i.test(key)) return num(n)
  if (isNum) return num(n)
  return String(v)
}

// Tìm mảng-object đầu tiên trong data (để render bảng)
function extractRows(data: unknown): Record<string, unknown>[] | null {
  if (!data || typeof data !== "object") return null
  const obj = data as Record<string, unknown>
  const inner = Object.keys(obj).length === 1 ? obj[Object.keys(obj)[0]] : obj
  const find = (o: unknown): Record<string, unknown>[] | null => {
    if (Array.isArray(o)) return o.length && typeof o[0] === "object" && o[0] !== null ? o as Record<string, unknown>[] : null
    if (o && typeof o === "object") for (const k of Object.keys(o)) { const r = find((o as Record<string, unknown>)[k]); if (r) return r }
    return null
  }
  return find(inner)
}

// Trích các trường scalar (summary) từ data
function extractSummary(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null
  const obj = data as Record<string, unknown>
  const inner = (Object.keys(obj).length === 1 ? obj[Object.keys(obj)[0]] : obj) as Record<string, unknown>
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null
  const flat: Record<string, unknown> = {}
  for (const k of Object.keys(inner)) { const v = inner[k]; if (v == null || typeof v !== "object") flat[k] = v }
  return Object.keys(flat).length ? flat : null
}

// ── Console script (interceptor + send) ───────────────────────────────────────
function makeConsoleScript(token: string, appOrigin: string): string {
  return `(function(){
if(window.__ghSync){window.__ghSync.box.style.display='block';return;}
var TOKEN='${token}',HOST='${appOrigin}';
var captured={};
var orig=window.fetch.bind(window);
var box=document.createElement('div');
box.style.cssText='position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#003B95;color:#fff;padding:14px 16px;border-radius:12px;font-family:sans-serif;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35);min-width:240px';
var t=document.createElement('div');t.style.cssText='font-weight:700;margin-bottom:8px';t.textContent='GoHub Sync';
var c=document.createElement('div');c.style.cssText='margin-bottom:10px;opacity:.9;font-size:12px';
var b=document.createElement('button');b.textContent='Gui ve GoHub';b.style.cssText='background:#fff;color:#003B95;border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;width:100%;margin-bottom:6px';
var h=document.createElement('div');h.style.cssText='font-size:11px;opacity:.75;line-height:1.45';h.textContent='Bam quanh portal (doi thang, xem SP, mo Affiliate Analytics) de bat cac bang. Xong bam nut tren.';
box.appendChild(t);box.appendChild(c);box.appendChild(b);box.appendChild(h);document.body.appendChild(box);
function refresh(){var ks=Object.keys(captured);c.textContent='Da bat '+ks.length+' bang'+(ks.length?': '+ks.join(', '):'');}
refresh();
window.fetch=async function(input,init){
  var res=await orig(input,init);
  try{
    var url=(typeof input==='string'?input:(input&&input.url))||'';
    if(url.indexOf('affiliateplatform/gql')>-1){
      var q=(url.split('q=')[1]||'q').split('&')[0];
      var vars={};try{vars=JSON.parse((init&&init.body)||'{}').variables||{};}catch(e){}
      res.clone().json().then(function(j){if(j&&j.data){captured[q]={variables:vars,data:j.data,at:Date.now()};refresh();}}).catch(function(){});
    }
  }catch(e){}
  return res;
};
async function send(){
  b.disabled=true;b.textContent='Dang gui...';
  var now=new Date(),year=now.getFullYear(),curMo=now.getMonth();
  var ts=function(d){return String(Math.floor(d.getTime()/1000));};
  var QM='query QueryCommissionKeyMetrics($startTime:Long,$endTime:Long,$commissionType:InsightCommissionType){QueryCommissionKeyMetrics(startTime:$startTime,endTime:$endTime,commissionType:$commissionType){affiliates itemsSold orderAmount estCommission}}';
  async function km(s,e){try{var r=await orig('/api/v3/affiliateplatform/gql?q=QueryCommissionKeyMetrics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationName:'QueryCommissionKeyMetrics',query:QM,variables:{commissionType:'TARGET_COMMISSION',startTime:ts(s),endTime:ts(e)}})});var j=await r.json();return j&&j.data&&j.data.QueryCommissionKeyMetrics||null;}catch(e){return null;}}
  var monthly=[];
  for(var m=0;m<=curMo;m++){var s=new Date(year,m,1),e=m<curMo?new Date(year,m+1,0,23,59,59):now;monthly.push({month:year+'-'+(m+1<10?'0':'')+(m+1),metrics:await km(s,e)});}
  for(var m2=0;m2<=curMo;m2++){var s2=new Date(year-1,m2,1),e2=new Date(year-1,m2+1,0,23,59,59);monthly.push({month:(year-1)+'-'+(m2+1<10?'0':'')+(m2+1),metrics:await km(s2,e2)});}
  try{
    var r=await orig(HOST+'/api/portal/shopee-sync',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+TOKEN},body:JSON.stringify({monthly:monthly,datasets:captured})});
    var rs=await r.json();
    b.disabled=false;b.textContent='Gui ve GoHub';
    if(r.ok){alert('Sync OK! '+monthly.length+' thang. Bang bat duoc: '+((rs.saved&&rs.saved.datasets)||[]).join(', ')+'\\nQuay lai GoHub bam Lam moi.');}
    else{alert('Sync loi '+r.status+': '+JSON.stringify(rs));}
  }catch(e){b.disabled=false;b.textContent='Gui ve GoHub';alert('Loi gui: '+e.message);}
}
b.onclick=send;
window.__ghSync={box:box,captured:captured};
})();`
}

function makeBookmarklet(token: string, appOrigin: string): string {
  return "javascript:" + encodeURIComponent(makeConsoleScript(token, appOrigin))
}

// ── Dynamic table (render bất kỳ mảng object nào) ─────────────────────────────
function DynamicTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [show, setShow] = useState(15)
  const cols = Array.from(rows.reduce((s: Set<string>, r) => { Object.keys(r || {}).forEach(k => s.add(k)); return s }, new Set<string>()))
  const shown = rows.slice(0, show)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
            {cols.map(c => <th key={c} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {shown.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              {cols.map(c => <td key={c} className="px-3 py-1.5 whitespace-nowrap text-slate-700">{fmtCell(c, r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {show < rows.length && (
        <button onClick={() => setShow(v => v + 30)} className="mt-2 text-[12px] text-[#003B95] hover:underline">
          Xem thêm ({rows.length - show} dòng)
        </button>
      )}
    </div>
  )
}

// ── Datasets section (mọi bảng bắt được từ portal) ───────────────────────────
function DatasetsSection({ datasets }: { datasets: Record<string, Dataset> }) {
  const keys = Object.keys(datasets)
  const [open, setOpen] = useState<Record<string, boolean>>(Object.fromEntries(keys.map((k, i) => [k, i === 0])))
  if (!keys.length) return null
  return (
    <div className="space-y-3">
      {keys.map(k => {
        const d = datasets[k]?.data
        const rows = extractRows(d)
        const summary = extractSummary(d)
        const isOpen = open[k]
        return (
          <div key={k} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button onClick={() => setOpen(o => ({ ...o, [k]: !o[k] }))}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                <Database size={15} className="text-[#003B95]" />
                <span className="font-semibold text-slate-700 text-[14px]">{k}</span>
                {rows && <span className="text-[11px] text-slate-400">({rows.length} dòng)</span>}
              </div>
              {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
            </button>
            {isOpen && (
              <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-3">
                {summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(summary).map(([sk, sv]) => (
                      <div key={sk} className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{sk}</p>
                        <p className="text-[13px] font-semibold text-slate-700 mt-0.5">{fmtCell(sk, sv)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {rows ? <DynamicTable rows={rows} /> : !summary && (
                  <pre className="text-[10px] bg-slate-50 rounded-lg p-3 overflow-x-auto text-slate-600 max-h-64">{JSON.stringify(d, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Monthly table ─────────────────────────────────────────────────────────────
function MonthlyTable({ monthly }: { monthly: MonthEntry[] }) {
  const curYear = new Date().getFullYear()
  const curData = monthly.filter(m => m.month.startsWith(String(curYear))).sort((a, b) => b.month.localeCompare(a.month))
  const prevMap = Object.fromEntries(monthly.filter(m => !m.month.startsWith(String(curYear))).map(m => [m.month.slice(5), m.metrics]))
  if (!curData.length) return null

  const totals = curData.reduce((a, m) => m.metrics ? { itemsSold: a.itemsSold + m.metrics.itemsSold, orderAmount: a.orderAmount + m.metrics.orderAmount, estCommission: a.estCommission + m.metrics.estCommission } : a, { itemsSold: 0, orderAmount: 0, estCommission: 0 })
  const mom = (c: number, p: number) => p > 0 ? ((c - p) / p * 100).toFixed(0) + "%" : "—"
  const cls = (c: number, p: number) => c > p ? "text-emerald-600" : c < p ? "text-rose-500" : "text-slate-400"

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <TrendingUp size={15} className="text-[#003B95]" />
        <h2 className="font-semibold text-slate-700 text-[14px]">Hoa hồng theo tháng — {curYear}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-semibold">Tháng</th>
              <th className="px-4 py-2.5 text-right font-semibold">Affiliates</th>
              <th className="px-4 py-2.5 text-right font-semibold">Items sold</th>
              <th className="px-4 py-2.5 text-right font-semibold">Doanh thu</th>
              <th className="px-4 py-2.5 text-right font-semibold">Commission</th>
              <th className="px-4 py-2.5 text-right font-semibold">YoY Rev</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {curData.map(m => {
              const mt = m.metrics, prev = prevMap[m.month.slice(5)]
              return (
                <tr key={m.month} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{fmtMonth(m.month)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{mt ? num(mt.affiliates) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{mt ? num(mt.itemsSold) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800 font-medium">{mt ? vnd(mt.orderAmount) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{mt ? vnd(mt.estCommission) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">{mt && prev ? <span className={cls(mt.orderAmount, prev.orderAmount)}>{mom(mt.orderAmount, prev.orderAmount)}</span> : "—"}</td>
                </tr>
              )
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-4 py-2.5 text-slate-700">Tổng {curYear}</td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-right text-slate-700">{num(totals.itemsSold)}</td>
              <td className="px-4 py-2.5 text-right text-slate-800">{vnd(totals.orderAmount)}</td>
              <td className="px-4 py-2.5 text-right text-amber-700">{vnd(totals.estCommission)}</td>
              <td className="px-4 py-2.5" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Summary cards (tháng hiện tại) ────────────────────────────────────────────
function SummaryCards({ monthly, legacyMetrics, synced_at, onRefresh, loading }: {
  monthly: MonthEntry[] | null; legacyMetrics?: Metrics | null; synced_at: string; onRefresh: () => void; loading: boolean
}) {
  const curMonth = new Date().toISOString().slice(0, 7)
  const cur = monthly?.find(m => m.month === curMonth)?.metrics ?? legacyMetrics ?? null
  const kpis = cur ? [
    { label: "Affiliates",      value: num(cur.affiliates),    color: "text-violet-600",  bg: "bg-violet-50"  },
    { label: "Items Sold",      value: num(cur.itemsSold),     color: "text-blue-600",    bg: "bg-blue-50"    },
    { label: "Doanh thu",       value: vnd(cur.orderAmount),   color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Est. Commission", value: vnd(cur.estCommission), color: "text-amber-600",   bg: "bg-amber-50"   },
  ] : []
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-slate-700 text-[15px]">Tháng hiện tại</h2>
          {synced_at && <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"><Clock size={10} /> {fmtDt(synced_at)}</p>}
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[13px] hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>
      {cur ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className={`rounded-xl border border-slate-100 p-4 ${k.bg}`}>
              <p className="text-[11px] text-slate-500 font-medium mb-1.5">{k.label}</p>
              <p className={`font-bold text-[15px] ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-[13px]">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-500" />
          Chưa có dữ liệu. Chạy script bên dưới để đồng bộ.
        </div>
      )}
    </div>
  )
}

// ── Sync panel (creator) ──────────────────────────────────────────────────────
function SyncPanel() {
  const toast = useToast()
  const [token, setToken]   = useState<string | null>(null)
  const [loading, setL]     = useState(true)
  const [regen, setRegen]   = useState(false)
  const [copied, setCopied] = useState(false)
  const [showScript, setSS] = useState(false)
  const appOrigin = typeof window !== "undefined" ? window.location.origin : ""

  useEffect(() => {
    fetch("/api/admin/portal-sync-token").then(r => r.json()).then(d => { if (d.token) setToken(d.token) }).catch(() => {}).finally(() => setL(false))
  }, [])

  async function regenToken() {
    setRegen(true)
    try { const r = await fetch("/api/admin/portal-sync-token", { method: "POST" }); const j = await r.json(); if (j.token) { setToken(j.token); toast.success("Đã tạo token mới") } }
    catch { toast.error("Hiếu đang fix, vui lòng đợi") } finally { setRegen(false) }
  }
  async function copyScript() {
    if (!token) return
    await navigator.clipboard.writeText(makeConsoleScript(token, appOrigin))
    setCopied(true); setTimeout(() => setCopied(false), 2500)
    toast.success("Đã copy! Paste vào Console trên trang Shopee rồi Enter")
  }

  if (loading) return <div className="h-28 bg-slate-100 rounded-xl animate-pulse" />
  if (!token) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <button onClick={regenToken} disabled={regen} className="w-full py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50">
        {regen ? "Đang tạo..." : "Tạo Sync Token"}
      </button>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><BookmarkPlus size={16} className="text-[#003B95]" /><h2 className="font-semibold text-slate-700 text-[15px]">Đồng bộ từ Shopee</h2></div>
        <button onClick={regenToken} disabled={regen} className="text-[12px] text-slate-400 hover:text-rose-500 flex items-center gap-1 disabled:opacity-50"><RefreshCw size={11} className={regen ? "animate-spin" : ""} /> Đổi token</button>
      </div>

      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 space-y-3">
        <p className="font-semibold text-emerald-800 text-[13px]">Cách dùng (chạy 1 lần, KHÔNG bị lặp):</p>
        <ol className="text-[13px] text-emerald-700 space-y-1 ml-2">
          <li>① Mở <a href={PORTALS[0].url} target="_blank" rel="noopener noreferrer" className="underline font-medium">Shopee Affiliate Portal</a> (đã đăng nhập)</li>
          <li>② <kbd className="bg-emerald-100 border border-emerald-300 px-1.5 rounded text-[11px] font-mono">F12</kbd> → tab <strong>Console</strong> → paste script → Enter</li>
          <li>③ Xuất hiện ô <strong>"GoHub Sync"</strong> góc dưới phải. Bấm quanh portal (đổi tháng, xem sản phẩm, mở Affiliate Analytics) để nó bắt các bảng</li>
          <li>④ Bấm <strong>"Gửi về GoHub"</strong> trong ô đó → quay lại đây nhấn <strong>Làm mới</strong></li>
        </ol>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copyScript} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors">
            {copied ? <><Check size={13} /> Đã copy!</> : <><Copy size={13} /> Copy Script</>}
          </button>
          <button onClick={() => setSS(v => !v)} className="text-[12px] text-emerald-700 underline">{showScript ? "Ẩn script" : "Xem script"}</button>
        </div>
        {showScript && <textarea readOnly value={makeConsoleScript(token, appOrigin)} rows={4} className="w-full text-[10px] font-mono bg-white border border-emerald-200 rounded-lg px-2 py-1.5 resize-none text-slate-600" />}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
        <a href={makeBookmarklet(token, appOrigin)}
          onClick={e => { e.preventDefault(); toast.warning("KÉO nút này vào Bookmarks bar — không click tại đây") }}
          draggable
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium cursor-grab active:cursor-grabbing select-none border-2 border-dashed border-blue-300">
          <BookmarkPlus size={13} /> Sync → GoHub
        </a>
        <p className="text-[12px] text-slate-500">KÉO vào Bookmarks bar để dùng nhanh sau (thay cho paste Console)</p>
      </div>
    </div>
  )
}

// ── Access panel (creator) ────────────────────────────────────────────────────
function AccessPanel() {
  const toast = useToast()
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setL]   = useState(true)
  const [add, setAdd]     = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => { fetch("/api/admin/portal-users").then(r => r.json()).then(d => setUsers(d.users ?? [])).catch(() => {}).finally(() => setL(false)) }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); if (!add.trim()) return; setAdding(true)
    try {
      const r = await fetch("/api/admin/portal-users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: add.trim() }) })
      const j = await r.json(); if (!r.ok) throw new Error(j.error)
      setUsers(p => p.some(u => u.username === j.user.username) ? p : [...p, j.user]); setAdd(""); toast.success("Đã cấp quyền")
    } catch (err: any) { toast.error(err.message || "Hiếu đang fix") } finally { setAdding(false) }
  }
  async function rm(username: string) {
    try { await fetch(`/api/admin/portal-users?username=${encodeURIComponent(username)}`, { method: "DELETE" }); setUsers(p => p.filter(u => u.username !== username)); toast.success("Đã thu hồi") }
    catch { toast.error("Hiếu đang fix") }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2"><Shield size={16} className="text-[#003B95]" /><h2 className="font-semibold text-slate-700 text-[15px]">Quyền truy cập Portal</h2></div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input value={add} onChange={e => setAdd(e.target.value)} placeholder="Username" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]" />
        <button type="submit" disabled={adding || !add.trim()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50"><Plus size={14} />{adding ? "..." : "Thêm"}</button>
      </form>
      {loading ? <p className="text-slate-400 text-[13px]">Đang tải...</p> : users.length === 0 ? <p className="text-slate-400 text-[13px]">Chưa có user nào.</p> : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.username} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div><p className="text-[13px] font-medium text-slate-700">{u.name || u.username}</p><p className="text-[11px] text-slate-400">{u.username}{u.email ? ` · ${u.email}` : ""}</p></div>
              <button onClick={() => rm(u.username)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PortalPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role ?? session?.user?.role ?? ""
  const isCreator = role === "creator"

  const [cached, setCached]   = useState<CachedData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadCached = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch("/api/portal/shopee-cached"); const j = await r.json(); setCached(j.data ?? null) }
    catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadCached() }, [loadCached])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#003B95]/10 flex items-center justify-center"><Link2 size={20} className="text-[#003B95]" /></div>
        <div><h1 className="text-xl font-semibold text-slate-800">Portal Access</h1><p className="text-slate-500 text-[13px]">Dữ liệu affiliate từ Shopee Seller Portal</p></div>
      </div>

      <SummaryCards monthly={cached?.monthly ?? null} legacyMetrics={cached?.metrics ?? null} synced_at={cached?.synced_at ?? ""} onRefresh={loadCached} loading={loading} />

      {!loading && cached?.monthly && cached.monthly.length > 0 && <MonthlyTable monthly={cached.monthly} />}

      {/* Mọi bảng bắt được từ portal (đầy đủ cột) */}
      {!loading && cached?.datasets && Object.keys(cached.datasets).length > 0 && <DatasetsSection datasets={cached.datasets} />}

      {isCreator && <SyncPanel />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PORTALS.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <div>
              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 mb-2">Shopee Affiliate</span>
              <h3 className="font-semibold text-slate-800 text-[15px]">{p.name}</h3>
              <p className="text-slate-500 text-[13px] mt-1">{p.desc}</p>
            </div>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors"><ExternalLink size={14} /> Mở Portal</a>
          </div>
        ))}
      </div>

      {isCreator && <AccessPanel />}
    </div>
  )
}
