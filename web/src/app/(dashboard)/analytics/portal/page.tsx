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

// ── Bookmarklet setup panel (creator only) ────────────────────────────────────
function BookmarkletPanel() {
  const toast = useToast()
  const [token,    setToken]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [regen,    setRegen]    = useState(false)
  const [copied,   setCopied]   = useState(false)
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

  async function copyToken() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const bookmarkletHref = token ? makeBookmarklet(token, appOrigin) : "#"

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookmarkPlus size={16} className="text-[#003B95]" />
        <h2 className="font-semibold text-slate-700 text-[15px]">Thiết lập Bookmarklet</h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-[13px] text-blue-800">
        <p className="font-semibold">Cách dùng:</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>Bước 1: {!token ? "Tạo token trước" : <><strong>Kéo nút xanh bên dưới</strong> vào thanh Bookmarks bar</>}</li>
          <li>Bước 2: Mở <a href={PORTALS[0].url} target="_blank" rel="noopener noreferrer" className="underline font-medium">Shopee Affiliate Portal</a> (phải đăng nhập Shopee)</li>
          <li>Bước 3: Click bookmark <strong>"Sync → GoHub"</strong> trên thanh bookmarks</li>
          <li>Bước 4: Xác nhận alert → quay lại đây nhấn "Làm mới"</li>
        </ol>
      </div>

      {loading ? (
        <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
      ) : !token ? (
        <button onClick={handleRegen} disabled={regen}
          className="w-full py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors">
          {regen ? "Đang tạo..." : "Tạo Sync Token"}
        </button>
      ) : (
        <div className="space-y-3">
          {/* Bookmarklet drag link */}
          <div className="flex items-center gap-3">
            <a
              href={bookmarkletHref}
              onClick={e => e.preventDefault()}
              draggable
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium cursor-grab active:cursor-grabbing select-none hover:bg-[#002d73] transition-colors"
              title="Kéo vào Bookmarks bar"
            >
              <BookmarkPlus size={14} />
              Sync → GoHub
            </a>
            <span className="text-[12px] text-slate-400">← Kéo vào Bookmarks bar</span>
          </div>

          {/* Token display */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <code className="text-[12px] text-slate-600 font-mono flex-1 truncate">{token}</code>
              <button onClick={copyToken} className="text-slate-400 hover:text-[#003B95] flex-shrink-0">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            <button onClick={handleRegen} disabled={regen} title="Tạo token mới (huỷ bookmarklet cũ)"
              className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50">
              <RefreshCw size={14} className={regen ? "animate-spin" : ""} />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Token này được nhúng trong bookmarklet. Tạo token mới sẽ vô hiệu hoá bookmarklet cũ.
          </p>
        </div>
      )}
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
