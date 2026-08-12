"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  ExternalLink, Link2, Plus, Trash2, UserPlus, Shield,
  RefreshCw, BookmarkPlus, Copy, Check, AlertTriangle, Clock,
  TrendingUp, Package,
} from "lucide-react"
import { useToast } from "@/components/toast"

const PORTALS = [
  { id: "commission", name: "Commission Analytics", desc: "Báo cáo hoa hồng affiliate.", url: "https://banhang.shopee.vn/portal/web-seller-affiliate/commission_analytics" },
  { id: "affiliate",  name: "Affiliate Analytics",  desc: "Hiệu suất affiliate: clicks, conversions.", url: "https://banhang.shopee.vn/portal/web-seller-affiliate/affiliate_analytics" },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface Metrics   { affiliates: number; itemsSold: number; orderAmount: number; estCommission: number }
interface MonthEntry { month: string; startDate: string; endDate: string; metrics: Metrics | null }
interface Product    { itemId: string; itemName: string; orderAmount: number; itemsSold: number; estCommission: number; commissionRate: number }
interface CachedData { monthly: MonthEntry[] | null; products: { total: number; list: Product[] } | null; synced_at: string }
interface PortalUser { username: string; name: string | null; email: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────
const vnd  = (n: number | string | null | undefined) => (Math.round(parseFloat(String(n ?? 0)) || 0)).toLocaleString("vi-VN") + " ₫"
const num  = (n: number | string | null | undefined) => (parseFloat(String(n ?? 0)) || 0).toLocaleString("vi-VN")
const pct  = (n: number | string | null | undefined) => ((parseFloat(String(n ?? 0)) || 0) * 100).toFixed(1) + "%"
const fmtDt = (iso: string) => new Date(iso).toLocaleString("vi-VN")
const fmtMonth = (m: string) => { const [y,mo] = m.split("-"); return `T${parseInt(mo)}/${y}` }

// ── Console script — fetch tất cả tháng + products ───────────────────────────
function makeConsoleScript(token: string, appOrigin: string): string {
  return `(async function(){
var TOKEN='${token}',HOST='${appOrigin}';
var now=new Date(),year=now.getFullYear(),curMo=now.getMonth();
var ts=function(d){return String(Math.floor(d.getTime()/1000));};
var gql=async function(q,vars,qStr){
  var r=await fetch('/api/v3/affiliateplatform/gql?q='+q,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationName:q,query:qStr,variables:vars})});
  return r.json();
};
var QMETRICS='query QueryCommissionKeyMetrics($startTime:Long,$endTime:Long,$commissionType:InsightCommissionType){QueryCommissionKeyMetrics(startTime:$startTime,endTime:$endTime,commissionType:$commissionType){affiliates itemsSold orderAmount estCommission}}';
var QLIST='query QueryCommissionList($startTime:Long,$endTime:Long,$commissionType:InsightCommissionType,$page:Int,$pageSize:Int){QueryCommissionList(startTime:$startTime,endTime:$endTime,commissionType:$commissionType,page:$page,pageSize:$pageSize){total list{itemId itemName orderAmount itemsSold estCommission commissionRate}}}';
try{
  // Fetch metrics for each month of current year
  var monthly=[];
  for(var m=0;m<=curMo;m++){
    var s=new Date(year,m,1);
    var e=m<curMo?new Date(year,m+1,0,23,59,59):now;
    var d=await gql('QueryCommissionKeyMetrics',{commissionType:'TARGET_COMMISSION',startTime:ts(s),endTime:ts(e)},QMETRICS);
    var met=d&&d.data&&d.data.QueryCommissionKeyMetrics||null;
    monthly.push({month:year+'-'+(m+1<10?'0':'')+(m+1),startDate:s.toISOString().slice(0,10),endDate:e.toISOString().slice(0,10),metrics:met});
    console.log('T'+(m+1)+':',met);
  }
  // Also fetch last year same months for YoY
  var prevYear=year-1;
  for(var m=0;m<=curMo;m++){
    var s=new Date(prevYear,m,1);
    var e=new Date(prevYear,m+1,0,23,59,59);
    var d=await gql('QueryCommissionKeyMetrics',{commissionType:'TARGET_COMMISSION',startTime:ts(s),endTime:ts(e)},QMETRICS);
    var met=d&&d.data&&d.data.QueryCommissionKeyMetrics||null;
    monthly.push({month:prevYear+'-'+(m+1<10?'0':'')+(m+1),startDate:s.toISOString().slice(0,10),endDate:e.toISOString().slice(0,10),metrics:met});
  }
  // Fetch top products for current month (up to 100)
  var ms=new Date(year,curMo,1);
  var ld=await gql('QueryCommissionList',{commissionType:'TARGET_COMMISSION',startTime:ts(ms),endTime:ts(now),page:1,pageSize:100},QLIST);
  var prods=ld&&ld.data&&ld.data.QueryCommissionList||null;
  // Send all
  var sy=await fetch(HOST+'/api/portal/shopee-sync',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+TOKEN},body:JSON.stringify({monthly:monthly,products:prods})});
  var rs=await sy.json();
  if(sy.ok){alert('Sync OK! '+monthly.length+' tháng, '+(prods&&prods.total||0)+' SP. Quay lai GoHub bam Lam moi.');}
  else{alert('Sync that bai: '+JSON.stringify(rs));}
}catch(e){console.error(e);alert('Loi: '+e.message);}
})();`
}

function makeBookmarklet(token: string, appOrigin: string): string {
  return "javascript:" + encodeURIComponent(makeConsoleScript(token, appOrigin))
}

// ── Monthly Table ─────────────────────────────────────────────────────────────
function MonthlyTable({ monthly }: { monthly: MonthEntry[] }) {
  const curYear = new Date().getFullYear()
  const curData  = monthly.filter(m => m.month.startsWith(String(curYear))).sort((a,b) => b.month.localeCompare(a.month))
  const prevData  = monthly.filter(m => !m.month.startsWith(String(curYear)))
  const prevMap   = Object.fromEntries(prevData.map(m => [m.month.slice(5), m.metrics]))

  const totals = curData.reduce((acc, m) => {
    const mt = m.metrics
    if (!mt) return acc
    return { itemsSold: acc.itemsSold + mt.itemsSold, orderAmount: acc.orderAmount + mt.orderAmount, estCommission: acc.estCommission + mt.estCommission }
  }, { itemsSold: 0, orderAmount: 0, estCommission: 0 })

  const mom = (cur: number, prv: number) => prv > 0 ? ((cur - prv) / prv * 100).toFixed(0) + "%" : "—"
  const momCls = (cur: number, prv: number) => cur > prv ? "text-emerald-600" : cur < prv ? "text-rose-500" : "text-slate-400"

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <TrendingUp size={15} className="text-[#003B95]" />
        <h2 className="font-semibold text-slate-700 text-[14px]">Theo tháng — {curYear}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-semibold">Tháng</th>
              <th className="px-4 py-2.5 text-right font-semibold">Items sold</th>
              <th className="px-4 py-2.5 text-right font-semibold">Doanh thu</th>
              <th className="px-4 py-2.5 text-right font-semibold">Commission</th>
              <th className="px-4 py-2.5 text-right font-semibold">YoY Rev</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {curData.map(m => {
              const mt   = m.metrics
              const moStr = m.month.slice(5)  // "08"
              const prev  = prevMap[moStr]
              return (
                <tr key={m.month} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{fmtMonth(m.month)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{mt ? num(mt.itemsSold) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800 font-medium">{mt ? vnd(mt.orderAmount) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{mt ? vnd(mt.estCommission) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {mt && prev ? (
                      <span className={momCls(mt.orderAmount, prev.orderAmount)}>
                        {mom(mt.orderAmount, prev.orderAmount)}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              )
            })}
            {/* Totals row */}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-4 py-2.5 text-slate-700">Tổng {curYear}</td>
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

// ── Products Table ────────────────────────────────────────────────────────────
function ProductsTable({ products }: { products: { total: number; list: Product[] } }) {
  const [show, setShow] = useState(10)
  const list = products.list.slice(0, show).sort((a,b) => b.orderAmount - a.orderAmount)
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={15} className="text-[#003B95]" />
          <h2 className="font-semibold text-slate-700 text-[14px]">Top sản phẩm tháng này</h2>
          <span className="text-[11px] text-slate-400">({products.total} SP)</span>
        </div>
        {show < products.list.length && (
          <button onClick={() => setShow(v => Math.min(v + 20, products.list.length))}
            className="text-[12px] text-[#003B95] hover:underline">
            Xem thêm
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-semibold">#</th>
              <th className="px-4 py-2.5 text-left font-semibold">Sản phẩm</th>
              <th className="px-4 py-2.5 text-right font-semibold">Items</th>
              <th className="px-4 py-2.5 text-right font-semibold">Doanh thu</th>
              <th className="px-4 py-2.5 text-right font-semibold">Commission</th>
              <th className="px-4 py-2.5 text-right font-semibold">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {list.map((p, i) => (
              <tr key={p.itemId} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-2 text-slate-400 text-[11px]">{i + 1}</td>
                <td className="px-4 py-2">
                  <p className="text-slate-700 font-medium line-clamp-1 max-w-[280px]">{p.itemName || p.itemId}</p>
                </td>
                <td className="px-4 py-2 text-right text-slate-600">{num(p.itemsSold)}</td>
                <td className="px-4 py-2 text-right text-slate-800 font-medium">{vnd(p.orderAmount)}</td>
                <td className="px-4 py-2 text-right text-amber-700">{vnd(p.estCommission)}</td>
                <td className="px-4 py-2 text-right text-slate-500">{pct(p.commissionRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Summary KPI cards ─────────────────────────────────────────────────────────
function SummaryCards({ monthly, synced_at, onRefresh, loading }: {
  monthly: MonthEntry[] | null; synced_at: string; onRefresh: () => void; loading: boolean
}) {
  const curMonth = new Date().toISOString().slice(0, 7)
  const cur = monthly?.find(m => m.month === curMonth)?.metrics ?? null
  const kpis = cur ? [
    { label: "Affiliates",      value: num(cur.affiliates),    color: "text-violet-600", bg: "bg-violet-50"  },
    { label: "Items Sold",      value: num(cur.itemsSold),     color: "text-blue-600",   bg: "bg-blue-50"    },
    { label: "Doanh thu",       value: vnd(cur.orderAmount),   color: "text-emerald-600",bg: "bg-emerald-50" },
    { label: "Est. Commission", value: vnd(cur.estCommission), color: "text-amber-600",  bg: "bg-amber-50"   },
  ] : []

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-slate-700 text-[15px]">Tháng hiện tại</h2>
          {synced_at && <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"><Clock size={10}/> {fmtDt(synced_at)}</p>}
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

// ── Bookmarklet/Console Panel ─────────────────────────────────────────────────
function SyncPanel() {
  const toast = useToast()
  const [token,   setToken]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regen,   setRegen]   = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [showScript, setShowScript] = useState(false)
  const appOrigin = typeof window !== "undefined" ? window.location.origin : ""

  useEffect(() => {
    fetch("/api/admin/portal-sync-token").then(r => r.json()).then(d => { if (d.token) setToken(d.token) }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleRegen() {
    setRegen(true)
    try {
      const res = await fetch("/api/admin/portal-sync-token", { method: "POST" })
      const json = await res.json()
      if (json.token) { setToken(json.token); toast.success("Đã tạo token mới") }
    } catch { toast.error("Hiếu đang fix, vui lòng đợi") } finally { setRegen(false) }
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
      <button onClick={handleRegen} disabled={regen}
        className="w-full py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50">
        {regen ? "Đang tạo..." : "Tạo Sync Token"}
      </button>
    </div>
  )

  const script = makeConsoleScript(token, appOrigin)
  const bookmarkletHref = makeBookmarklet(token, appOrigin)

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookmarkPlus size={16} className="text-[#003B95]" />
          <h2 className="font-semibold text-slate-700 text-[15px]">Đồng bộ từ Shopee</h2>
        </div>
        <button onClick={handleRegen} disabled={regen} className="text-[12px] text-slate-400 hover:text-rose-500 flex items-center gap-1 disabled:opacity-50">
          <RefreshCw size={11} className={regen ? "animate-spin" : ""} /> Đổi token
        </button>
      </div>

      {/* Console method */}
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 space-y-3">
        <p className="font-semibold text-emerald-800 text-[13px]">Cách dùng:</p>
        <ol className="text-[13px] text-emerald-700 space-y-1 ml-2">
          <li>① Mở <a href={PORTALS[0].url} target="_blank" rel="noopener noreferrer" className="underline font-medium">Shopee Affiliate Portal</a> (đã đăng nhập)</li>
          <li>② Nhấn <kbd className="bg-emerald-100 border border-emerald-300 px-1.5 rounded text-[11px] font-mono">F12</kbd> → tab <strong>Console</strong></li>
          <li>③ Paste script → Enter → đợi alert</li>
          <li>④ Quay lại đây → nhấn <strong>Làm mới</strong></li>
        </ol>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copyScript}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors">
            {copied ? <><Check size={13}/> Đã copy!</> : <><Copy size={13}/> Copy Script</>}
          </button>
          <button onClick={() => setShowScript(v => !v)} className="text-[12px] text-emerald-700 underline">
            {showScript ? "Ẩn script" : "Xem script"}
          </button>
        </div>
        {showScript && (
          <textarea readOnly value={script} rows={4}
            className="w-full text-[10px] font-mono bg-white border border-emerald-200 rounded-lg px-2 py-1.5 resize-none text-slate-600" />
        )}
      </div>

      {/* Bookmarklet */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
        <a href={bookmarkletHref}
          onClick={e => { e.preventDefault(); toast.warning("KÉO nút này vào Bookmarks bar — không click tại đây") }}
          draggable
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium cursor-grab active:cursor-grabbing select-none border-2 border-dashed border-blue-300">
          <BookmarkPlus size={13}/> Sync → GoHub
        </a>
        <p className="text-[12px] text-slate-500">KÉO vào Bookmarks bar để dùng lại nhanh sau</p>
      </div>
    </div>
  )
}

// ── Access Panel ──────────────────────────────────────────────────────────────
function AccessPanel() {
  const toast = useToast()
  const [users, setUsers]     = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [add, setAdd]         = useState("")
  const [adding, setAdding]   = useState(false)

  useEffect(() => {
    fetch("/api/admin/portal-users").then(r=>r.json()).then(d=>setUsers(d.users??[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); if (!add.trim()) return; setAdding(true)
    try {
      const res = await fetch("/api/admin/portal-users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:add.trim()})})
      const json = await res.json(); if (!res.ok) throw new Error(json.error)
      setUsers(p=>p.some(u=>u.username===json.user.username)?p:[...p,json.user]); setAdd(""); toast.success("Đã cấp quyền")
    } catch(err:any){toast.error(err.message||"Hiếu đang fix")} finally{setAdding(false)}
  }
  async function rm(username: string) {
    try {
      await fetch(`/api/admin/portal-users?username=${encodeURIComponent(username)}`,{method:"DELETE"})
      setUsers(p=>p.filter(u=>u.username!==username)); toast.success("Đã thu hồi")
    } catch{toast.error("Hiếu đang fix")}
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2"><Shield size={16} className="text-[#003B95]"/>
        <h2 className="font-semibold text-slate-700 text-[15px]">Quyền truy cập Portal</h2>
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input value={add} onChange={e=>setAdd(e.target.value)} placeholder="Username"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]"/>
        <button type="submit" disabled={adding||!add.trim()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50">
          <Plus size={14}/>{adding?"...":"Thêm"}
        </button>
      </form>
      {loading?<p className="text-slate-400 text-[13px]">Đang tải...</p>:users.length===0?<p className="text-slate-400 text-[13px]">Chưa có user nào.</p>:(
        <div className="space-y-2">
          {users.map(u=>(
            <div key={u.username} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div><p className="text-[13px] font-medium text-slate-700">{u.name||u.username}</p><p className="text-[11px] text-slate-400">{u.username}{u.email?` · ${u.email}`:""}</p></div>
              <button onClick={()=>rm(u.username)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PortalPage() {
  const {data:session} = useSession()
  const role      = (session?.user as any)?.role ?? session?.user?.role ?? ""
  const isCreator = role === "creator"

  const [cached,  setCached]  = useState<CachedData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadCached = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/portal/shopee-cached")
      const json = await res.json()
      setCached(json.data ?? null)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadCached() }, [loadCached])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#003B95]/10 flex items-center justify-center">
          <Link2 size={20} className="text-[#003B95]"/>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Portal Access</h1>
          <p className="text-slate-500 text-[13px]">Dữ liệu affiliate từ Shopee Seller Portal</p>
        </div>
      </div>

      {/* Summary cards — current month */}
      <SummaryCards monthly={cached?.monthly??null} synced_at={cached?.synced_at??""} onRefresh={loadCached} loading={loading}/>

      {/* Monthly breakdown */}
      {!loading && cached?.monthly && cached.monthly.length > 0 && (
        <MonthlyTable monthly={cached.monthly}/>
      )}

      {/* Top products */}
      {!loading && cached?.products && cached.products.list?.length > 0 && (
        <ProductsTable products={cached.products}/>
      )}

      {/* Sync panel — creator only */}
      {isCreator && <SyncPanel/>}

      {/* Portal links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PORTALS.map(p=>(
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <div>
              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 mb-2">Shopee Affiliate</span>
              <h3 className="font-semibold text-slate-800 text-[15px]">{p.name}</h3>
              <p className="text-slate-500 text-[13px] mt-1">{p.desc}</p>
            </div>
            <a href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors">
              <ExternalLink size={14}/> Mở Portal
            </a>
          </div>
        ))}
      </div>

      {/* Access management — creator only */}
      {isCreator && <AccessPanel/>}
    </div>
  )
}
