"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  ExternalLink, Link2, Plus, Trash2, UserPlus, Shield,
  RefreshCw, BarChart2, ShoppingBag, TrendingUp, DollarSign,
  BookmarkPlus, Copy, Check, AlertTriangle, Clock,
} from "lucide-react"
import { useToast } from "@/components/toast"

const PORTALS = [
  {
    id:   "commission",
    name: "Commission Analytics",
    desc: "Báo cáo hoa hồng affiliate theo sản phẩm, đơn hàng.",
    url:  "https://banhang.shopee.vn/portal/web-seller-affiliate/commission_analytics",
  },
  {
    id:   "affiliate",
    name: "Affiliate Analytics",
    desc: "Tổng quan hiệu suất affiliate: clicks, conversions, revenue.",
    url:  "https://banhang.shopee.vn/portal/web-seller-affiliate/affiliate_analytics",
  },
]

function fmtVND(n: number | string | null | undefined) {
  const v = parseFloat(String(n ?? 0)) || 0
  return Math.round(v).toLocaleString("vi-VN") + " ₫"
}
function fmtNum(n: number | string | null | undefined) {
  return (parseFloat(String(n ?? 0)) || 0).toLocaleString("vi-VN")
}
function fmtDt(iso: string) {
  return new Date(iso).toLocaleString("vi-VN")
}

interface Metrics { affiliates: number; itemsSold: number; orderAmount: number; estCommission: number }
interface CachedData { metrics: Metrics | null; startDate: string; endDate: string; synced_at: string }
interface PortalUser { username: string; name: string | null; email: string | null }

// ── Bookmarklet generator ─────────────────────────────────────────────────────
function makeBookmarklet(token: string, appOrigin: string): string {
  const code = `(async function(){
  var TOKEN='${token}';
  var HOST='${appOrigin}';
  var now=new Date();
  var start=new Date(now.getFullYear(),now.getMonth(),1);
  var toTs=function(d){return String(Math.floor(d.getTime()/1000));};
  try{
    var r=await fetch('/api/v3/affiliateplatform/gql?q=QueryCommissionKeyMetrics',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        operationName:'QueryCommissionKeyMetrics',
        query:'query QueryCommissionKeyMetrics($startTime:Long,$endTime:Long,$commissionType:InsightCommissionType){QueryCommissionKeyMetrics(startTime:$startTime,endTime:$endTime,commissionType:$commissionType){affiliates itemsSold orderAmount estCommission}}',
        variables:{commissionType:'TARGET_COMMISSION',startTime:toTs(start),endTime:toTs(now)}
      })
    });
    var d=await r.json();
    var metrics=d&&d.data&&d.data.QueryCommissionKeyMetrics;
    if(!metrics){alert('\\u274c Shopee kh\\u00f4ng tr\\u1ea3 data. Vui l\\u00f2ng \\u0111\\u0103ng nh\\u1eadp l\\u1ea1i Shopee.');return;}
    var sy=await fetch(HOST+'/api/portal/shopee-sync',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+TOKEN},
      body:JSON.stringify({
        metrics,
        startDate:start.toISOString().slice(0,10),
        endDate:now.toISOString().slice(0,10)
      })
    });
    if(sy.ok){alert('\\u2705 \\u0110\\u00e3 \\u0111\\u1ed3ng b\\u1ed9! Quay l\\u1ea1i GoHub \\u0111\\u1ec3 xem d\\u1eef li\\u1ec7u.');}
    else{alert('\\u274c Sync th\\u1ea5t b\\u1ea1i. Ki\\u1ec3m tra token.');}
  }catch(e){alert('\\u274c L\\u1ed7i: '+e.message);}
})();`
  return "javascript:" + encodeURIComponent(code)
}

// ── Metrics display ───────────────────────────────────────────────────────────
function MetricsPanel({ cached, loading, onRefresh }: {
  cached: CachedData | null; loading: boolean; onRefresh: () => void
}) {
  const kpis = cached?.metrics ? [
    { label: "Affiliates",       value: fmtNum(cached.metrics.affiliates),    icon: UserPlus,    color: "text-violet-600", bg: "bg-violet-50"  },
    { label: "Items Sold",       value: fmtNum(cached.metrics.itemsSold),     icon: ShoppingBag, color: "text-blue-600",   bg: "bg-blue-50"    },
    { label: "Doanh thu",        value: fmtVND(cached.metrics.orderAmount),   icon: TrendingUp,  color: "text-emerald-600",bg: "bg-emerald-50" },
    { label: "Est. Commission",  value: fmtVND(cached.metrics.estCommission), icon: DollarSign,  color: "text-amber-600",  bg: "bg-amber-50"   },
  ] : []

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-[#003B95]" />
          <h2 className="font-semibold text-slate-700 text-[15px]">Commission Analytics</h2>
          {cached?.synced_at && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock size={11} /> Cập nhật {fmtDt(cached.synced_at)}
            </span>
          )}
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[13px] hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Làm mới
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : cached?.metrics ? (
        <>
          {cached.startDate && (
            <p className="text-[12px] text-slate-400">
              Kỳ: {cached.startDate} → {cached.endDate}
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map(k => (
              <div key={k.label} className={`rounded-xl border border-slate-100 p-4 ${k.bg}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <k.icon size={13} className={k.color} />
                  <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                </div>
                <p className={`font-bold text-[15px] ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-[13px]">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-500" />
          <span>Chưa có dữ liệu. Dùng bookmarklet bên dưới để đồng bộ lần đầu.</span>
        </div>
      )}
    </div>
  )
}

// Raw JS script (for paste vào DevTools Console — KHÔNG có prefix javascript:)
function makeConsoleScript(token: string, appOrigin: string): string {
  return `(async function(){
  var TOKEN='${token}',HOST='${appOrigin}';
  var now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1);
  var ts=function(d){return String(Math.floor(d.getTime()/1000));};
  try{
    var r=await fetch('/api/v3/affiliateplatform/gql?q=QueryCommissionKeyMetrics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationName:'QueryCommissionKeyMetrics',query:'query QueryCommissionKeyMetrics($startTime:Long,$endTime:Long,$commissionType:InsightCommissionType){QueryCommissionKeyMetrics(startTime:$startTime,endTime:$endTime,commissionType:$commissionType){affiliates itemsSold orderAmount estCommission}}',variables:{commissionType:'TARGET_COMMISSION',startTime:ts(start),endTime:ts(now)}})});
    var d=await r.json();
    var m=d&&d.data&&d.data.QueryCommissionKeyMetrics;
    if(!m){console.error('Shopee data null:',JSON.stringify(d));return;}
    var sy=await fetch(HOST+'/api/portal/shopee-sync',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+TOKEN},body:JSON.stringify({metrics:m,startDate:start.toISOString().slice(0,10),endDate:now.toISOString().slice(0,10)})});
    console.log(sy.ok?'OK: sync thanh cong':'FAIL: '+sy.status);
    alert(sy.ok?'Sync thanh cong! Quay lai GoHub bam Lam moi.':'Sync that bai '+sy.status);
  }catch(e){console.error(e);alert('Loi: '+e.message);}
})();`
}

// ── Bookmarklet setup panel (creator only) ────────────────────────────────────
function BookmarkletPanel() {
  const toast = useToast()
  const [token,       setToken]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [regen,       setRegen]       = useState(false)
  const [copiedConsole, setCopiedConsole] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const appOrigin = typeof window !== "undefined" ? window.location.origin : ""

  useEffect(() => {
    fetch("/api/admin/portal-sync-token")
      .then(r => r.json())
      .then(d => { if (d.token) setToken(d.token) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRegen() {
    setRegen(true)
    try {
      const res  = await fetch("/api/admin/portal-sync-token", { method: "POST" })
      const json = await res.json()
      if (json.token) { setToken(json.token); toast.success("Đã tạo token mới") }
    } catch { toast.error("Hiếu đang fix, vui lòng đợi") }
    finally { setRegen(false) }
  }

  async function copyConsole() {
    if (!token) return
    await navigator.clipboard.writeText(makeConsoleScript(token, appOrigin))
    setCopiedConsole(true)
    setTimeout(() => setCopiedConsole(false), 2500)
    toast.success("Đã copy! Paste vào Console trên trang Shopee rồi Enter")
  }

  const bookmarkletHref = token ? makeBookmarklet(token, appOrigin) : "#"

  if (loading) return <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
  if (!token) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <button onClick={handleRegen} disabled={regen}
        className="w-full py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors">
        {regen ? "Đang tạo..." : "Tạo Sync Token (bước đầu tiên)"}
      </button>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookmarkPlus size={16} className="text-[#003B95]" />
          <h2 className="font-semibold text-slate-700 text-[15px]">Đồng bộ dữ liệu Shopee</h2>
        </div>
        <button onClick={handleRegen} disabled={regen} title="Tạo token mới"
          className="text-[12px] text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors disabled:opacity-50">
          <RefreshCw size={11} className={regen ? "animate-spin" : ""} /> Đổi token
        </button>
      </div>

      {/* Cách 1: Console (đơn giản nhất) */}
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">1</span>
          <p className="font-semibold text-emerald-800 text-[14px]">Cách nhanh nhất — Dùng DevTools Console</p>
        </div>
        <ol className="text-[13px] text-emerald-700 space-y-1 ml-8">
          <li>① Mở <a href={PORTALS[0].url} target="_blank" rel="noopener noreferrer" className="underline font-medium">Shopee Affiliate Portal</a> (đảm bảo đã đăng nhập)</li>
          <li>② Nhấn <kbd className="bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded text-[11px] font-mono">F12</kbd> → tab <strong>Console</strong></li>
          <li>③ Click nút bên dưới để copy script → Paste vào Console → Enter</li>
          <li>④ Thấy alert "Sync thành công" → quay lại đây nhấn "Làm mới"</li>
        </ol>
        <button
          onClick={copyConsole}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors"
        >
          {copiedConsole ? <><Check size={14} /> Đã copy!</> : <><Copy size={14} /> Copy script để paste vào Console</>}
        </button>
        {showConsole && token && (
          <textarea
            readOnly
            value={makeConsoleScript(token, appOrigin)}
            rows={3}
            className="w-full text-[10px] font-mono bg-white border border-emerald-200 rounded-lg px-2 py-1.5 resize-none text-slate-600"
          />
        )}
        <button onClick={() => setShowConsole(v => !v)} className="text-[11px] text-emerald-600 underline">
          {showConsole ? "Ẩn script" : "Xem script thủ công"}
        </button>
      </div>

      {/* Cách 2: Bookmarklet (cần kéo) */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-slate-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">2</span>
          <p className="font-semibold text-slate-600 text-[14px]">Cách tiện hơn sau này — Bookmarklet</p>
        </div>
        <p className="text-[13px] text-slate-500 ml-8">
          Kéo nút xanh dưới đây vào <strong>Bookmarks bar</strong> (thanh bookmark trên Chrome). Sau đó mỗi lần muốn sync, chỉ cần click bookmark khi đang ở trang Shopee.
        </p>
        <div className="flex items-center gap-3 ml-8">
          <a
            href={bookmarkletHref}
            onClick={e => { e.preventDefault(); toast.warning("Kéo nút này vào Bookmarks bar — đừng click trực tiếp tại đây") }}
            draggable
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium cursor-grab active:cursor-grabbing select-none border-2 border-dashed border-blue-300 hover:border-blue-400 transition-colors"
            title="KÉO vào Bookmarks bar (đừng click)"
          >
            <BookmarkPlus size={14} />
            Sync → GoHub
          </a>
          <span className="text-[12px] text-slate-400">⬅ KÉO vào Bookmarks bar</span>
        </div>
        <p className="text-[11px] text-slate-400 ml-8">
          Chưa thấy Bookmarks bar? Nhấn <kbd className="bg-slate-200 px-1 rounded font-mono text-[10px]">Ctrl+Shift+B</kbd> để bật.
        </p>
      </div>
    </div>
  )
}

// ── Access management ─────────────────────────────────────────────────────────
function AccessPanel() {
  const toast = useToast()
  const [users,    setUsers]    = useState<PortalUser[]>([])
  const [loading,  setLoading]  = useState(true)
  const [addInput, setAddInput] = useState("")
  const [adding,   setAdding]   = useState(false)

  useEffect(() => {
    fetch("/api/admin/portal-users").then(r => r.json()).then(d => setUsers(d.users ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addInput.trim()) return
    setAdding(true)
    try {
      const res  = await fetch("/api/admin/portal-users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: addInput.trim() }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setUsers(prev => prev.some(u => u.username === json.user.username) ? prev : [...prev, json.user])
      setAddInput("")
      toast.success(`Đã cấp quyền cho ${json.user.name || json.user.username}`)
    } catch (err: any) { toast.error(err.message || "Hiếu đang fix, vui lòng đợi") }
    finally { setAdding(false) }
  }

  async function handleRemove(username: string) {
    try {
      const res = await fetch(`/api/admin/portal-users?username=${encodeURIComponent(username)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setUsers(prev => prev.filter(u => u.username !== username))
      toast.success("Đã thu hồi quyền")
    } catch { toast.error("Hiếu đang fix, vui lòng đợi") }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-[#003B95]" />
        <h2 className="font-semibold text-slate-700 text-[15px]">Quyền truy cập Portal</h2>
      </div>
      <p className="text-slate-400 text-[12px]">User được thêm vào có thể xem data trong Portal tab.</p>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input value={addInput} onChange={e => setAddInput(e.target.value)}
          placeholder="Username"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]" />
        <button type="submit" disabled={adding || !addInput.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          <Plus size={14} />{adding ? "..." : "Thêm"}
        </button>
      </form>
      {loading ? <p className="text-slate-400 text-[13px]">Đang tải...</p> : users.length === 0 ? (
        <p className="text-slate-400 text-[13px]">Chưa có user nào được cấp quyền.</p>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.username} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div>
                <p className="text-[13px] font-medium text-slate-700">{u.name || u.username}</p>
                <p className="text-[11px] text-slate-400">{u.username}{u.email ? ` · ${u.email}` : ""}</p>
              </div>
              <button onClick={() => handleRemove(u.username)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors">
                <Trash2 size={14} />
              </button>
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
  const role      = (session?.user as any)?.role ?? session?.user?.role ?? ""
  const isCreator = role === "creator"

  const [cached,  setCached]  = useState<CachedData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadCached = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/portal/shopee-cached")
      const json = await res.json()
      setCached(json.data ?? null)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadCached() }, [loadCached])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#003B95]/10 flex items-center justify-center">
          <Link2 size={20} className="text-[#003B95]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Portal Access</h1>
          <p className="text-slate-500 text-[13px]">Dữ liệu affiliate từ Shopee Seller Portal</p>
        </div>
      </div>

      {/* Commission data */}
      <MetricsPanel cached={cached} loading={loading} onRefresh={loadCached} />

      {/* Bookmarklet setup — creator only */}
      {isCreator && <BookmarkletPanel />}

      {/* Portal links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PORTALS.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <div>
              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 mb-2">Shopee Affiliate</span>
              <h3 className="font-semibold text-slate-800 text-[15px]">{p.name}</h3>
              <p className="text-slate-500 text-[13px] mt-1">{p.desc}</p>
            </div>
            <a href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors">
              <ExternalLink size={14} />
              Mở Portal
            </a>
          </div>
        ))}
      </div>

      {/* Access management — creator only */}
      {isCreator && <AccessPanel />}
    </div>
  )
}
