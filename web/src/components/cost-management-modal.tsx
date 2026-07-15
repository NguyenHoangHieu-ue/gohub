"use client"

import React, { useState, useEffect } from "react"
import { X, Save, Edit2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Port từ gohub-intel CostManagementModal. Thay motion/react bằng CSS animation có sẵn
// (animate-overlay-in / animate-modal-in). Dùng các endpoint cost sẵn có của web:
// /api/channel-costs, /api/channel-group-costs(+[id]), /api/channel-cost-settings, /api/config/subchannels.

interface CostValue {
  type: "amount" | "percent"
  value: number
}

interface ChannelCost {
  channel: string
  month: string
  ads: CostValue
  platformFee: CostValue
  sponsorProducts: CostValue
  media: CostValue
}

interface GroupCost {
  id?: string
  group_name: "B2C" | "B2B"
  month: string
  item_name: string
  amount: number
  note: string
}

interface CostManagementModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  initialMonth?: string
  // "b2c" = mở từ tab B2C: chỉ hiện kênh B2C (ẩn tab B2B/Group — B2C không liên quan ecom/B2B).
  // Mặc định "all" = đủ 3 tab (dùng cho trang B2B/Channels).
  scope?: "all" | "b2c"
}

const B2B_CHANNELS_LIST = ["Traveloka", "VN-Ecom", "Momo", "Klook", "VN OD Klook", "ZaloPay", "Tiket", "Tiqets", "KKday", "Pelago", "BIDV", "Myrealtrip", "Trazy", "CellphoneS", "Vietravel", "Én Việt", "Trip", "Divui", "Coming", "Tiki", "Shopeepay", "Payoo", "LynkID", "Get Your Guide", "PhuotViVu", "VN-Wholesales", "VN-B2B Portal", "Global-Wholesales", "Wholesales", "Global-B2B Portal", "VN-B2B"]
const B2C_CHANNELS_LIST = ["VN-Loyalty", "VN-Web eSIM", "VN-Social", "Mobile-App", "Global-Web", "VN-Web SIM", "Misc.", "Topup", "US-B2C Portal", "Global-B2C"]

export const CostManagementModal: React.FC<CostManagementModalProps> = ({ isOpen, onClose, onSave, initialMonth, scope = "all" }) => {
  const [costMonth, setCostMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [monthlyCosts, setMonthlyCosts] = useState<Record<string, ChannelCost>>({})
  const [groupCosts, setGroupCosts] = useState<GroupCost[]>([])
  const [newGroupCost, setNewGroupCost] = useState<GroupCost>({
    group_name: "B2C",
    month: costMonth,
    item_name: "",
    amount: 0,
    note: "",
  })
  const [savingCosts, setSavingCosts] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [activeCostTab, setActiveCostTab] = useState<"b2c" | "b2b" | "group">(scope === "b2c" ? "b2c" : "b2b")
  const [vnEcomSubChannels, setVnEcomSubChannels] = useState<string[]>([])
  const [travelokaSubChannels, setTravelokaSubChannels] = useState<string[]>([])
  const [shopeepaySubChannels, setShopeepaySubChannels] = useState<string[]>([])
  const [costSettings, setCostSettings] = useState<Record<string, string>>({})

  const fetchData = async (month: string) => {
    try {
      const [costsRes, groupRes, settingsRes, vnEcomSubRes, travelokaSubRes, shopeepaySubRes] = await Promise.all([
        fetch(`/api/channel-costs?month=${month}`),
        fetch(`/api/channel-group-costs?month=${month}`),
        fetch(`/api/channel-cost-settings?month=${month}`),
        fetch(`/api/config/subchannels?channel=VN-Ecom`),
        fetch(`/api/config/subchannels?channel=Traveloka`),
        fetch(`/api/config/subchannels?channel=Shopeepay`),
      ])

      if (costsRes.ok) setMonthlyCosts(await costsRes.json())
      if (groupRes.ok) setGroupCosts(await groupRes.json())
      if (settingsRes.ok) setCostSettings(await settingsRes.json())
      if (vnEcomSubRes.ok) setVnEcomSubChannels(await vnEcomSubRes.json())
      if (travelokaSubRes.ok) setTravelokaSubChannels(await travelokaSubRes.json())
      if (shopeepaySubRes.ok) setShopeepaySubChannels(await shopeepaySubRes.json())
    } catch (err) {
      console.error("Error fetching data:", err)
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

  const handleSaveGroupCost = async () => {
    if (!newGroupCost.item_name || newGroupCost.amount <= 0) {
      alert("Please provide item name and amount")
      return
    }

    setSavingCosts(true)
    try {
      const res = await fetch("/api/channel-group-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newGroupCost, updatedBy: "system" }),
      })

      if (res.ok) {
        setSaveSuccess("Group cost saved!")
        setNewGroupCost({
          group_name: "B2C",
          month: costMonth,
          item_name: "",
          amount: 0,
          note: "",
        })
        fetchData(costMonth)
        setTimeout(() => setSaveSuccess(null), 3000)
      }
    } catch (err) {
      console.error("Error saving group cost:", err)
    } finally {
      setSavingCosts(false)
    }
  }

  const handleDeleteGroupCost = async (id: string) => {
    try {
      const res = await fetch(`/api/channel-group-costs/${id}`, { method: "DELETE" })
      if (res.ok) {
        fetchData(costMonth)
      }
    } catch (err) {
      console.error("Error deleting group cost:", err)
    }
  }

  const handleEditGroupCost = (cost: GroupCost) => {
    setNewGroupCost({ ...cost })
    const modalContent = document.querySelector(".overflow-auto")
    if (modalContent) {
      modalContent.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const toggleSubchannelMode = async (channel: string, mode: "total" | "subchannels") => {
    try {
      const res = await fetch("/api/channel-cost-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, month: costMonth, mode, updatedBy: "system" }),
      })
      if (res.ok) {
        setCostSettings(prev => ({ ...prev, [channel]: mode }))
      }
    } catch (err) {
      console.error("Error toggling mode:", err)
    }
  }

  const handleSaveCost = async (channel: string) => {
    setSavingCosts(true)
    setSaveSuccess(null)
    try {
      if ((channel === "VN-Ecom" || channel === "Traveloka" || channel === "Shopeepay") && costSettings[channel] === "subchannels") {
        const subChannelsList = channel === "VN-Ecom" ? vnEcomSubChannels : (channel === "Traveloka" ? travelokaSubChannels : shopeepaySubChannels)
        const promises = subChannelsList.map(sc => {
          const subChannelName = `${channel} - ${sc}`
          const costData = monthlyCosts[subChannelName] || {
            channel: subChannelName,
            month: costMonth,
            ads: { type: "amount", value: 0 },
            platformFee: { type: "amount", value: 0 },
            sponsorProducts: { type: "amount", value: 0 },
            media: { type: "amount", value: 0 },
          }
          return fetch("/api/channel-costs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...costData, updatedBy: "system" }),
          })
        })
        await Promise.all(promises)
      } else {
        const costData = monthlyCosts[channel] || {
          channel,
          month: costMonth,
          ads: { type: "amount", value: 0 },
          platformFee: { type: "amount", value: 0 },
          sponsorProducts: { type: "amount", value: 0 },
          media: { type: "amount", value: 0 },
        }

        await fetch("/api/channel-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...costData, updatedBy: "system" }),
        })
      }

      setSaveSuccess(`Saved ${channel} successfully!`)
      setTimeout(() => setSaveSuccess(null), 3000)
      onSave()
    } catch (err) {
      console.error("Error saving costs:", err)
    } finally {
      setSavingCosts(false)
    }
  }

  const handleSaveAll = async () => {
    setSavingCosts(true)
    setSaveSuccess(null)
    try {
      const channelsToSave: string[] = []
      const baseChannels = activeCostTab === "b2c" ? B2C_CHANNELS_LIST : B2B_CHANNELS_LIST

      baseChannels.forEach(channel => {
        if ((channel === "VN-Ecom" || channel === "Traveloka" || channel === "Shopeepay") && costSettings[channel] === "subchannels") {
          const subChannelsList = channel === "VN-Ecom" ? vnEcomSubChannels : (channel === "Traveloka" ? travelokaSubChannels : shopeepaySubChannels)
          subChannelsList.forEach(sc => channelsToSave.push(`${channel} - ${sc}`))
        } else {
          channelsToSave.push(channel)
        }
      })

      const promises = channelsToSave.map(channel => {
        const costData = monthlyCosts[channel] || {
          channel,
          month: costMonth,
          ads: { type: "amount", value: 0 },
          platformFee: { type: "amount", value: 0 },
          sponsorProducts: { type: "amount", value: 0 },
          media: { type: "amount", value: 0 },
        }

        return fetch("/api/channel-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...costData, updatedBy: "system" }),
        })
      })

      await Promise.all(promises)
      setSaveSuccess(`Saved all ${activeCostTab.toUpperCase()} channels successfully!`)
      setTimeout(() => setSaveSuccess(null), 3000)
      onSave()
    } catch (err) {
      console.error("Error saving all costs:", err)
    } finally {
      setSavingCosts(false)
    }
  }

  const updateCost = (channel: string, category: keyof Omit<ChannelCost, "channel" | "month">, field: keyof CostValue, value: any) => {
    setMonthlyCosts(prev => ({
      ...prev,
      [channel]: {
        ...(prev[channel] || {
          channel,
          month: costMonth,
          ads: { type: "amount", value: 0 },
          platformFee: { type: "amount", value: 0 },
          sponsorProducts: { type: "amount", value: 0 },
          media: { type: "amount", value: 0 },
        }),
        [category]: {
          ...(prev[channel]?.[category] || { type: "amount", value: 0 }),
          [field]: value,
        },
      },
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-overlay-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-modal-in">
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
                onChange={(e) => setCostMonth(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            {scope !== "b2c" && (
              <button
                onClick={() => setActiveCostTab("b2b")}
                className={cn(
                  "px-6 py-2 text-sm font-bold rounded-lg transition-all",
                  activeCostTab === "b2b" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                B2B Channels
              </button>
            )}
            <button
              onClick={() => setActiveCostTab("b2c")}
              className={cn(
                "px-6 py-2 text-sm font-bold rounded-lg transition-all",
                activeCostTab === "b2c" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              B2C Channels
            </button>
            {scope !== "b2c" && (
              <button
                onClick={() => setActiveCostTab("group")}
                className={cn(
                  "px-6 py-2 text-sm font-bold rounded-lg transition-all",
                  activeCostTab === "group" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Group Costs
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {saveSuccess && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg border border-emerald-100">
                  <Save className="w-3 h-3" />
                  {saveSuccess}
                </div>
              )}
            </div>
            {activeCostTab !== "group" && (
              <button
                onClick={handleSaveAll}
                disabled={savingCosts}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save All {activeCostTab.toUpperCase()}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {activeCostTab === "group" ? (
              <div className="space-y-6">
                <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-blue-900">{newGroupCost.id ? "Edit Group Cost" : "Add New Group Cost"}</h3>
                    {newGroupCost.id && (
                      <button
                        onClick={() => setNewGroupCost({
                          group_name: "B2C",
                          month: costMonth,
                          item_name: "",
                          amount: 0,
                          note: "",
                        })}
                        className="text-xs text-blue-600 hover:underline font-bold"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Channel Group</label>
                      <select
                        value={newGroupCost.group_name}
                        onChange={(e) => setNewGroupCost(prev => ({ ...prev, group_name: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="B2B">B2B</option>
                        <option value="B2C">B2C</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Marketing Campaign"
                        value={newGroupCost.item_name}
                        onChange={(e) => setNewGroupCost(prev => ({ ...prev, item_name: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount (VND)</label>
                      <input
                        type="number"
                        value={newGroupCost.amount}
                        onChange={(e) => setNewGroupCost(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Note</label>
                      <input
                        type="text"
                        placeholder="Optional notes..."
                        value={newGroupCost.note}
                        onChange={(e) => setNewGroupCost(prev => ({ ...prev, note: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleSaveGroupCost}
                      disabled={savingCosts}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {newGroupCost.id ? "Update Cost Item" : "Add Cost Item"}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-bold text-slate-800 px-2">Existing Group Costs for {costMonth}</h3>
                  {groupCosts.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-slate-400 text-sm">No group costs recorded for this month.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {groupCosts.map((cost) => (
                        <div key={cost.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                              cost.group_name === "B2C" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
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
                              <p className="text-sm font-bold text-slate-900">{new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(cost.amount)}</p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Amount</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEditGroupCost(cost)}
                                className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                title="Edit"
                              >
                                <Edit2 className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => cost.id && handleDeleteGroupCost(cost.id)}
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                title="Delete"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              (activeCostTab === "b2c" ? B2C_CHANNELS_LIST : B2B_CHANNELS_LIST).map((channel) => {
                const isSupportSubchannel = channel === "VN-Ecom" || channel === "Traveloka" || channel === "Shopeepay"
                const isSubchannelMode = isSupportSubchannel && costSettings[channel] === "subchannels"
                const subChannelsList = channel === "VN-Ecom" ? vnEcomSubChannels : (channel === "Traveloka" ? travelokaSubChannels : shopeepaySubChannels)

                const renderChannelRow = (chanName: string, displayName?: string) => {
                  const costs = monthlyCosts[chanName] || {
                    ads: { type: "amount", value: 0 },
                    platformFee: { type: "amount", value: 0 },
                    sponsorProducts: { type: "amount", value: 0 },
                    media: { type: "amount", value: 0 },
                  }

                  return (
                    <div key={chanName} className={cn("bg-slate-50 rounded-2xl p-4 border border-slate-100", displayName && "ml-8 border-l-4 border-l-blue-200")}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col">
                          <h3 className="font-bold text-slate-800">{displayName || chanName}</h3>
                          {isSupportSubchannel && !displayName && (
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                onClick={() => toggleSubchannelMode(channel, "total")}
                                className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold transition-all", !isSubchannelMode ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}
                              >
                                Total Mode
                              </button>
                              <button
                                onClick={() => toggleSubchannelMode(channel, "subchannels")}
                                className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold transition-all", isSubchannelMode ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}
                              >
                                Sub-channel Mode
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleSaveCost(chanName)}
                          disabled={savingCosts}
                          className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-3 h-3" />
                          Save
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {(["ads", "platformFee", "sponsorProducts", "media"] as const).map((cat) => (
                          <div key={cat} className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cat.replace(/([A-Z])/g, " $1")}</label>
                            <div className="flex gap-1">
                              <input
                                type="number"
                                value={costs[cat]?.value || 0}
                                onChange={(e) => updateCost(chanName, cat, "value", parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                              <select
                                value={costs[cat]?.type || "amount"}
                                onChange={(e) => updateCost(chanName, cat, "type", e.target.value)}
                                className="px-1 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] focus:ring-2 focus:ring-blue-500 outline-none"
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

                if (isSubchannelMode) {
                  return (
                    <div key={channel} className="space-y-4">
                      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-blue-900">{channel} (Sub-channel Mode)</h3>
                          <p className="text-[10px] text-blue-600">Input costs for each sub-channel below. They will be aggregated in reports.</p>
                        </div>
                        <button
                          onClick={() => toggleSubchannelMode(channel, "total")}
                          className="text-xs bg-white text-blue-600 px-3 py-1 rounded-lg border border-blue-200 font-bold hover:bg-blue-50 transition-all"
                        >
                          Switch to Total Mode
                        </button>
                      </div>
                      {subChannelsList.map(sc => renderChannelRow(`${channel} - ${sc}`, sc))}
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
