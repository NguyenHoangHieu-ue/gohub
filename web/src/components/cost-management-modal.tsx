"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { X, Save, Edit2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"

// Port từ gohub-intel CostManagementModal.
// Endpoint: /api/channel-costs, /api/channel-group-costs(+[id]), /api/channel-cost-settings, /api/config/subchannels.
// Fixes (s97): dirty-state tracking, toast thay alert(), onSave sau group cost, xác nhận xoá, mở rộng write roles.

interface CostValue { type: "amount" | "percent"; value: number }

interface ChannelCost {
  channel: string; month: string
  ads: CostValue; platformFee: CostValue; sponsorProducts: CostValue; media: CostValue
}

interface GroupCost {
  id?: string; group_name: "B2C" | "B2B"; month: string
  item_name: string; amount: number; note: string
}

export interface CostManagementModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  initialMonth?: string
  // "b2c" = mở từ tab B2C: chỉ hiện kênh B2C (ẩn tab B2B/Group).
  scope?: "all" | "b2c"
}

const B2B_CHANNELS_LIST = ["Traveloka", "VN-Ecom", "Momo", "Klook", "VN OD Klook", "ZaloPay", "Tiket", "Tiqets", "KKday", "Pelago", "BIDV", "Myrealtrip", "Trazy", "CellphoneS", "Vietravel", "Én Việt", "Trip", "Divui", "Coming", "Tiki", "Shopeepay", "Payoo", "LynkID", "Get Your Guide", "PhuotViVu", "VN-Wholesales", "VN-B2B Portal", "Global-Wholesales", "Wholesales", "Global-B2B Portal", "VN-B2B"]
const B2C_CHANNELS_LIST = ["VN-Loyalty", "VN-Web eSIM", "VN-Social", "Mobile-App", "Global-Web", "VN-Web SIM", "Misc.", "Topup", "US-B2C Portal", "Global-B2C"]
const SUB_CHANNEL_PARENTS = ["VN-Ecom", "Traveloka", "Shopeepay"]

const DEFAULT_COST = (ch: string, mo: string): ChannelCost => ({
  channel: ch, month: mo,
  ads:             { type: "amount", value: 0 },
  platformFee:     { type: "amount", value: 0 },
  sponsorProducts: { type: "amount", value: 0 },
  media:           { type: "amount", value: 0 },
})

const deepCopyCosts = (costs: Record<string, ChannelCost>) =>
  JSON.parse(JSON.stringify(costs)) as Record<string, ChannelCost>

function costsDiffer(a: ChannelCost | undefined, b: ChannelCost | undefined): boolean {
  const empty = (c: ChannelCost | undefined) => !c || (
    c.ads.value === 0 && c.platformFee.value === 0 && c.sponsorProducts.value === 0 && c.media.value === 0
  )
  if (empty(a) && empty(b)) return false
  if (empty(a) !== empty(b)) return true
  for (const cat of ["ads", "platformFee", "sponsorProducts", "media"] as const) {
    const ca = a![cat] || { type: "amount", value: 0 }
    const cb = b![cat] || { type: "amount", value: 0 }
    if (ca.type !== cb.type || ca.value !== cb.value) return true
  }
  return false
}

export const CostManagementModal: React.FC<CostManagementModalProps> = ({
  isOpen, onClose, onSave, initialMonth, scope = "all",
}) => {
  const toast = useToast()

  // Group default: B2C scope → B2C, B2B scope (all) → B2B
  const defaultGroup = scope === "b2c" ? "B2C" : "B2B"
  const BLANK_GROUP: GroupCost = { group_name: defaultGroup as "B2C" | "B2B", month: "", item_name: "", amount: 0, note: "" }

  const [costMonth,          setCostMonth]          = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [monthlyCosts,       setMonthlyCosts]       = useState<Record<string, ChannelCost>>({})
  const [savedCosts,         setSavedCosts]         = useState<Record<string, ChannelCost>>({})
  const [groupCosts,         setGroupCosts]         = useState<GroupCost[]>([])
  const [newGroupCost,       setNewGroupCost]       = useState<GroupCost>({ ...BLANK_GROUP, month: costMonth })
  const [groupFormError,     setGroupFormError]     = useState<string | null>(null)
  const [confirmDeleteId,    setConfirmDeleteId]    = useState<string | null>(null)
  const [savingCosts,        setSavingCosts]        = useState(false)
  const [activeCostTab,      setActiveCostTab]      = useState<"b2c" | "b2b" | "group">(scope === "b2c" ? "b2c" : "b2b")
  const [vnEcomSubChannels,      setVnEcomSubChannels]      = useState<string[]>([])
  const [travelokaSubChannels,   setTravelokaSubChannels]   = useState<string[]>([])
  const [shopeepaySubChannels,   setShopeepaySubChannels]   = useState<string[]>([])
  const [costSettings,       setCostSettings]       = useState<Record<string, string>>({})

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchData = async (month: string) => {
    try {
      // Group costs: filter by scope để B2C modal chỉ thấy B2C items, B2B modal chỉ thấy B2B items.
      const groupFilter = scope === "b2c" ? "&group=B2C" : "&group=B2B"
      const [costsRes, groupRes, settingsRes, vnEcomSubRes, travelokaSubRes, shopeepaySubRes] = await Promise.all([
        fetch(`/api/channel-costs?month=${month}`),
        fetch(`/api/channel-group-costs?month=${month}${groupFilter}`),
        fetch(`/api/channel-cost-settings?month=${month}`),
        fetch(`/api/config/subchannels?channel=VN-Ecom`),
        fetch(`/api/config/subchannels?channel=Traveloka`),
        fetch(`/api/config/subchannels?channel=Shopeepay`),
      ])
      if (costsRes.ok) {
        const costs = await costsRes.json() as Record<string, ChannelCost>
        setMonthlyCosts(costs)
        setSavedCosts(deepCopyCosts(costs))   // baseline for dirty tracking
      }
      if (groupRes.ok)    setGroupCosts(await groupRes.json())
      if (settingsRes.ok) setCostSettings(await settingsRes.json())
      if (vnEcomSubRes.ok)     setVnEcomSubChannels(await vnEcomSubRes.json())
      if (travelokaSubRes.ok)  setTravelokaSubChannels(await travelokaSubRes.json())
      if (shopeepaySubRes.ok)  setShopeepaySubChannels(await shopeepaySubRes.json())
    } catch (err) {
      console.error("Error fetching cost data:", err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchData(initialMonth || costMonth)
      if (initialMonth) setCostMonth(initialMonth)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMonth])

  useEffect(() => {
    if (isOpen) {
      fetchData(costMonth)
      setNewGroupCost(prev => ({ ...prev, month: costMonth }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costMonth])

  // ── Dirty tracking ───────────────────────────────────────────────────────────

  const isDirty = (chanName: string) =>
    costsDiffer(monthlyCosts[chanName], savedCosts[chanName])

  // Tab-level dirty: used to enable/disable "Save All" button.
  const isTabDirty = useMemo(() => {
    const baseList = activeCostTab === "b2c" ? B2C_CHANNELS_LIST : B2B_CHANNELS_LIST
    return baseList.some(ch => {
      if (SUB_CHANNEL_PARENTS.includes(ch) && costSettings[ch] === "subchannels") {
        const subs = ch === "VN-Ecom" ? vnEcomSubChannels : ch === "Traveloka" ? travelokaSubChannels : shopeepaySubChannels
        return subs.some(sc => isDirty(`${ch} - ${sc}`))
      }
      return isDirty(ch)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyCosts, savedCosts, activeCostTab, costSettings, vnEcomSubChannels, travelokaSubChannels, shopeepaySubChannels])

  // ── Subchannel mode toggle ────────────────────────────────────────────────────

  const toggleSubchannelMode = async (channel: string, mode: "total" | "subchannels") => {
    try {
      const res = await fetch("/api/channel-cost-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, month: costMonth, mode, updatedBy: "system" }),
      })
      if (res.ok) {
        setCostSettings(prev => ({ ...prev, [channel]: mode }))
      } else {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || "Không thể đổi chế độ, vui lòng thử lại")
      }
    } catch {
      toast.error("Hiếu đang fix, vui lòng đợi")
    }
  }

  // ── Update local cost state ───────────────────────────────────────────────────

  const updateCost = (
    channel: string,
    category: keyof Omit<ChannelCost, "channel" | "month">,
    field: keyof CostValue,
    value: number | string,
  ) => {
    setMonthlyCosts(prev => ({
      ...prev,
      [channel]: {
        ...(prev[channel] || DEFAULT_COST(channel, costMonth)),
        [category]: {
          ...(prev[channel]?.[category] || { type: "amount", value: 0 }),
          [field]: value,
        },
      },
    }))
  }

  // ── Save individual channel ───────────────────────────────────────────────────

  const handleSaveCost = async (chanName: string) => {
    setSavingCosts(true)
    try {
      const isSupportParent = SUB_CHANNEL_PARENTS.includes(chanName)
      if (isSupportParent && costSettings[chanName] === "subchannels") {
        const subList = chanName === "VN-Ecom" ? vnEcomSubChannels
          : chanName === "Traveloka" ? travelokaSubChannels : shopeepaySubChannels
        await Promise.all(subList.map(sc => {
          const key = `${chanName} - ${sc}`
          return fetch("/api/channel-costs", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(monthlyCosts[key] || DEFAULT_COST(key, costMonth)), updatedBy: "system" }),
          })
        }))
        // Mark sub-channels as saved
        setSavedCosts(prev => {
          const upd = { ...prev }
          subList.forEach(sc => {
            const key = `${chanName} - ${sc}`
            upd[key] = deepCopyCosts({ [key]: monthlyCosts[key] || DEFAULT_COST(key, costMonth) })[key]
          })
          return upd
        })
      } else {
        const res = await fetch("/api/channel-costs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(monthlyCosts[chanName] || DEFAULT_COST(chanName, costMonth)), updatedBy: "system" }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          toast.error(body?.error || "Lưu thất bại")
          return
        }
        setSavedCosts(prev => ({ ...prev, [chanName]: deepCopyCosts({ [chanName]: monthlyCosts[chanName] || DEFAULT_COST(chanName, costMonth) })[chanName] }))
      }
      toast.success(`Đã lưu ${chanName}`)
      onSave()
    } catch {
      toast.error("Hiếu đang fix, vui lòng đợi")
    } finally {
      setSavingCosts(false)
    }
  }

  // ── Save all channels in current tab ─────────────────────────────────────────

  const handleSaveAll = async () => {
    setSavingCosts(true)
    try {
      const baseList = activeCostTab === "b2c" ? B2C_CHANNELS_LIST : B2B_CHANNELS_LIST
      const toSave: string[] = []
      baseList.forEach(ch => {
        if (SUB_CHANNEL_PARENTS.includes(ch) && costSettings[ch] === "subchannels") {
          const subs = ch === "VN-Ecom" ? vnEcomSubChannels : ch === "Traveloka" ? travelokaSubChannels : shopeepaySubChannels
          subs.forEach(sc => toSave.push(`${ch} - ${sc}`))
        } else {
          toSave.push(ch)
        }
      })

      const results = await Promise.all(toSave.map(ch =>
        fetch("/api/channel-costs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(monthlyCosts[ch] || DEFAULT_COST(ch, costMonth)), updatedBy: "system" }),
        })
      ))
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) {
        toast.error(`${failed} kênh lưu thất bại`)
        return
      }
      // Mark all as saved
      setSavedCosts(prev => {
        const upd = { ...prev }
        toSave.forEach(ch => { upd[ch] = deepCopyCosts({ [ch]: monthlyCosts[ch] || DEFAULT_COST(ch, costMonth) })[ch] })
        return upd
      })
      toast.success(`Đã lưu tất cả kênh ${activeCostTab.toUpperCase()}`)
      onSave()
    } catch {
      toast.error("Hiếu đang fix, vui lòng đợi")
    } finally {
      setSavingCosts(false)
    }
  }

  // ── Group costs ───────────────────────────────────────────────────────────────

  const handleSaveGroupCost = async () => {
    if (!newGroupCost.item_name.trim()) {
      setGroupFormError("Vui lòng nhập tên mục chi phí")
      return
    }
    if (newGroupCost.amount <= 0) {
      setGroupFormError("Số tiền phải lớn hơn 0")
      return
    }
    setGroupFormError(null)
    setSavingCosts(true)
    try {
      const res = await fetch("/api/channel-group-costs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newGroupCost, updatedBy: "system" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || "Lưu thất bại")
        return
      }
      toast.success(newGroupCost.id ? "Đã cập nhật chi phí" : "Đã thêm chi phí mới")
      setNewGroupCost({ group_name: defaultGroup as "B2C" | "B2B", month: costMonth, item_name: "", amount: 0, note: "" })
      await fetchData(costMonth)
      onSave()   // refresh analytics numbers
    } catch {
      toast.error("Hiếu đang fix, vui lòng đợi")
    } finally {
      setSavingCosts(false)
    }
  }

  const handleEditGroupCost = (cost: GroupCost) => {
    setNewGroupCost({ ...cost })
    setGroupFormError(null)
    const el = document.querySelector(".overflow-auto")
    if (el) el.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleDeleteGroupCost = async (id: string) => {
    try {
      const res = await fetch(`/api/channel-group-costs/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Đã xoá mục chi phí")
        setConfirmDeleteId(null)
        await fetchData(costMonth)
        onSave()
      } else {
        toast.error("Xoá thất bại")
      }
    } catch {
      toast.error("Hiếu đang fix, vui lòng đợi")
    }
  }

  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────────────────────────

  const renderChannelRow = (chanName: string, displayName?: string, parentChannel?: string) => {
    const isSupportParent = SUB_CHANNEL_PARENTS.includes(chanName)
    const isSubchannelMode = isSupportParent && costSettings[chanName] === "subchannels"
    const costs = monthlyCosts[chanName] || DEFAULT_COST(chanName, costMonth)

    // For sub-channel rows, dirty = that specific sub-channel key
    const dirty = isDirty(chanName)

    return (
      <div key={chanName} className={cn("bg-slate-50 rounded-2xl p-4 border border-slate-100", displayName && "ml-8 border-l-4 border-l-brand-200")}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <h3 className="font-bold text-slate-800">{displayName || chanName}</h3>
            {isSupportParent && !displayName && (
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => toggleSubchannelMode(chanName, "total")}
                  className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold transition-all", !isSubchannelMode ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500 hover:bg-slate-300")}
                >Total Mode</button>
                <button
                  onClick={() => toggleSubchannelMode(chanName, "subchannels")}
                  className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold transition-all", isSubchannelMode ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500 hover:bg-slate-300")}
                >Sub-channel Mode</button>
              </div>
            )}
          </div>
          <button
            onClick={() => handleSaveCost(chanName)}
            disabled={savingCosts || !dirty}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-colors",
              dirty
                ? "bg-brand-600 text-white hover:bg-brand-700"
                : "bg-slate-200 text-slate-400 cursor-not-allowed",
              savingCosts && "opacity-50",
            )}
          >
            <Save className="w-3 h-3" />
            {dirty ? "Save" : "Saved"}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(["ads", "platformFee", "sponsorProducts", "media"] as const).map(cat => (
            <div key={cat} className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {cat === "platformFee" ? "Platform Fee" : cat === "sponsorProducts" ? "Sponsor Prods" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  step="any"
                  // Show "" when 0 → user can click and type immediately without fighting the "0"
                  value={costs[cat]?.value ? costs[cat].value : ""}
                  placeholder="0"
                  onChange={e => updateCost(chanName, cat, "value", e.target.value === "" ? 0 : (parseFloat(e.target.value) || 0))}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                />
                <select
                  value={costs[cat]?.type ?? "amount"}
                  onChange={e => updateCost(chanName, cat, "type", e.target.value)}
                  className="px-1 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="amount">VND</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-overlay-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-modal-in">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Operational Cost Management</h2>
              <p className="text-sm text-slate-500">Input Ads, Platform, Sponsor, and Media fees per channel.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="month"
                value={costMonth}
                onChange={e => setCostMonth(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            {/* B2B Channels chỉ hiện khi scope="all" (mở từ B2B/Channels tab) */}
            {scope !== "b2c" && (
              <button
                onClick={() => setActiveCostTab("b2b")}
                className={cn("px-6 py-2 text-sm font-bold rounded-lg transition-all", activeCostTab === "b2b" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >B2B Channels</button>
            )}
            <button
              onClick={() => setActiveCostTab("b2c")}
              className={cn("px-6 py-2 text-sm font-bold rounded-lg transition-all", activeCostTab === "b2c" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >B2C Channels</button>
            {/* Group Costs luôn hiện; label chỉ rõ scope */}
            <button
              onClick={() => setActiveCostTab("group")}
              className={cn("px-6 py-2 text-sm font-bold rounded-lg transition-all", activeCostTab === "group" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >{scope === "b2c" ? "B2C Group" : "B2B Group"}</button>
          </div>

          {/* Save All */}
          {activeCostTab !== "group" && (
            <div className="flex justify-end">
              <button
                onClick={handleSaveAll}
                disabled={savingCosts || !isTabDirty}
                className={cn(
                  "flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-xl transition-all",
                  isTabDirty
                    ? "bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-800/20"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed",
                  savingCosts && "opacity-50",
                )}
              >
                <Save className="w-4 h-4" />
                {isTabDirty ? `Save All ${activeCostTab.toUpperCase()}` : "No Changes"}
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {activeCostTab === "group" ? (
              /* ── Group Costs ─────────────────────────────────────────────── */
              <div className="space-y-6">
                <div className="bg-brand-50 rounded-2xl p-6 border border-brand-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-brand-800">{newGroupCost.id ? "Sửa mục chi phí" : "Thêm chi phí mới"}</h3>
                    {newGroupCost.id && (
                      <button
                        onClick={() => { setNewGroupCost({ group_name: defaultGroup as "B2C" | "B2B", month: costMonth, item_name: "", amount: 0, note: "" }); setGroupFormError(null) }}
                        className="text-xs text-brand-600 hover:underline font-bold"
                      >Huỷ sửa</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Channel Group</label>
                      <select
                        value={newGroupCost.group_name}
                        onChange={e => setNewGroupCost(prev => ({ ...prev, group_name: e.target.value as "B2C" | "B2B" }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      >
                        <option value="B2B">B2B</option>
                        <option value="B2C">B2C</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên mục *</label>
                      <input
                        type="text"
                        placeholder="VD: Marketing Campaign"
                        value={newGroupCost.item_name}
                        onChange={e => { setNewGroupCost(prev => ({ ...prev, item_name: e.target.value })); setGroupFormError(null) }}
                        className={cn("w-full px-3 py-2 bg-white border rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none", groupFormError && !newGroupCost.item_name.trim() ? "border-red-400" : "border-slate-200")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số tiền (VND) *</label>
                      <input
                        type="number"
                        value={newGroupCost.amount || ""}
                        onChange={e => { setNewGroupCost(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 })); setGroupFormError(null) }}
                        className={cn("w-full px-3 py-2 bg-white border rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none", groupFormError && newGroupCost.amount <= 0 ? "border-red-400" : "border-slate-200")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ghi chú</label>
                      <input
                        type="text"
                        placeholder="Tuỳ chọn..."
                        value={newGroupCost.note}
                        onChange={e => setNewGroupCost(prev => ({ ...prev, note: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  </div>
                  {groupFormError && (
                    <p className="mt-3 text-xs text-red-600 font-medium">{groupFormError}</p>
                  )}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleSaveGroupCost}
                      disabled={savingCosts}
                      className="flex items-center gap-2 px-6 py-2 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition-all shadow-lg shadow-brand-800/20 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {newGroupCost.id ? "Cập nhật" : "Thêm mục"}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-bold text-slate-800 px-2">Chi phí {defaultGroup} tháng {costMonth}</h3>
                  {groupCosts.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-slate-400 text-sm">Chưa có chi phí nào tháng này.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {groupCosts.map(cost => (
                        <div key={cost.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-4">
                            <div className={cn("px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                              cost.group_name === "B2C" ? "bg-purple-50 text-purple-600" : "bg-brand-50 text-brand-600"
                            )}>
                              {cost.group_name}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900">{cost.item_name}</h4>
                              {cost.note && <p className="text-xs text-slate-500">{cost.note}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-900">
                                {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(cost.amount)}
                              </p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Amount</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEditGroupCost(cost)}
                                className="p-2 text-slate-300 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-all"
                                title="Sửa"
                              ><Edit2 className="w-5 h-5" /></button>
                              {confirmDeleteId === cost.id ? (
                                <div className="flex items-center gap-1 px-2">
                                  <button
                                    onClick={() => handleDeleteGroupCost(cost.id!)}
                                    className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg font-bold"
                                  >Xoá</button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                                  >Huỷ</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(cost.id || "")}
                                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                  title="Xoá"
                                ><Trash2 className="w-5 h-5" /></button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Channel Costs ───────────────────────────────────────────── */
              (activeCostTab === "b2c" ? B2C_CHANNELS_LIST : B2B_CHANNELS_LIST).map(channel => {
                const isSupportParent = SUB_CHANNEL_PARENTS.includes(channel)
                const isSubchannelMode = isSupportParent && costSettings[channel] === "subchannels"
                const subList = channel === "VN-Ecom" ? vnEcomSubChannels : channel === "Traveloka" ? travelokaSubChannels : shopeepaySubChannels

                if (isSubchannelMode) {
                  return (
                    <div key={channel} className="space-y-4">
                      <div className="bg-brand-50 rounded-2xl p-4 border border-brand-100 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-brand-800">{channel} (Sub-channel Mode)</h3>
                          <p className="text-[10px] text-brand-600">Nhập chi phí cho từng sub-channel bên dưới.</p>
                        </div>
                        <button
                          onClick={() => toggleSubchannelMode(channel, "total")}
                          className="text-xs bg-white text-brand-600 px-3 py-1 rounded-lg border border-brand-200 font-bold hover:bg-brand-50 transition-all"
                        >Switch to Total Mode</button>
                      </div>
                      {subList.map(sc => renderChannelRow(`${channel} - ${sc}`, sc, channel))}
                    </div>
                  )
                }

                return renderChannelRow(channel)
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
