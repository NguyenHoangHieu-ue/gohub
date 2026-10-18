# Kiểm kê điều khiển: Manage Costs

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/targets`
- Tệp quét (2): `app/(dashboard)/analytics/targets/page.tsx`, `components/cost-management-modal.tsx`
- Dòng mã: 1195
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`, `components/toast.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (9):** `/api/config/b2c-kpi-targets`, `/api/config/b2c-budget`, `/api/user/me`, `/api/planning/targets`, `/api/channel-costs`, `/api/channel-group-costs`, `/api/channel-cost-settings`, `/api/config/subchannels`, `/api/channel-group-costs/`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (18)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| targets-B01 | (icon) | `onClick` | `saving // disabled // !dirty` | page.tsx:160 |  |  |
| targets-B02 | Chi phí B2C | `() => setShowCostModal(true)` |  | page.tsx:445 |  |  |
| targets-B03 | (icon) | `handleSave` | `saving // loading // !canEdit // !dirty` | page.tsx:459 |  |  |
| targets-B04 | Total Mode | `() => toggleSubchannelMode(chanName, "total")` |  | cost-management-modal.tsx:352 |  |  |
| targets-B05 | Sub-channel Mode | `() => toggleSubchannelMode(chanName, "subchannels")` |  | cost-management-modal.tsx:356 |  |  |
| targets-B06 | (icon) | `() => handleSaveCost(chanName)` | `savingCosts // !dirty` | cost-management-modal.tsx:363 |  |  |
| targets-B07 | (icon) | `onClose` |  | cost-management-modal.tsx:429 |  |  |
| targets-B08 | B2B Channels | `() => setActiveCostTab("b2b")` |  | cost-management-modal.tsx:439 |  |  |
| targets-B09 | B2C Channels | `() => setActiveCostTab("b2c")` |  | cost-management-modal.tsx:444 |  |  |
| targets-B10 | (icon) | `() => setActiveCostTab("group")` |  | cost-management-modal.tsx:449 |  |  |
| targets-B11 | {isTabDirty ? `Save All $ ` : "No Changes"} | `handleSaveAll` | `savingCosts // !isTabDirty` | cost-management-modal.tsx:458 |  |  |
| targets-B12 | Huỷ sửa | `() => { setNewGroupCost({ group_name: defaultGroup as "B2C" / "B2B", month: costMonth, ite` |  | cost-management-modal.tsx:486 |  |  |
| targets-B13 | (icon) | `handleSaveGroupCost` | `savingCosts` | cost-management-modal.tsx:538 |  |  |
| targets-B14 | Sửa | `() => handleEditGroupCost(cost)` |  | cost-management-modal.tsx:578 |  |  |
| targets-B15 | Xoá | `() => handleDeleteGroupCost(cost.id!)` |  | cost-management-modal.tsx:585 |  |  |
| targets-B16 | Huỷ | `() => setConfirmDeleteId(null)` |  | cost-management-modal.tsx:589 |  |  |
| targets-B17 | Xoá | `() => setConfirmDeleteId(cost.id // "")` |  | cost-management-modal.tsx:595 |  |  |
| targets-B18 | Switch to Total Mode | `() => toggleSubchannelMode(channel, "total")` |  | cost-management-modal.tsx:624 |  |  |

### 2.2 Ô nhập và hộp tích (8)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| targets-I01 | number «0» — ) : ( | `targets[`${item.channel}_${m}`] // ""` | `e => onChange(`${item.channel}_${m}`, parseFloat(e.target.value) // 0)` | page.tsx:116 |  |  |
| targets-I02 | number «0» | `c[k] // ""` | `e => setField(m, k, parseFloat(e.target.value) // 0)` | page.tsx:229 |  |  |
| targets-I03 | number «0» | `cellOf(m)[mk] // ""` | `e => setCell(m, { [mk]: parseFloat(e.target.value) // 0 })` | page.tsx:280 |  |  |
| targets-I04 | number «0» | `costs[cat]?.value ? costs[cat].value : ""` | `e => updateCost(chanName, cat, "value", e.target.value === "" ? 0 : (parseFloat(` | cost-management-modal.tsx:385 |  |  |
| targets-I05 | month | `costMonth` | `e => setCostMonth(e.target.value)` | cost-management-modal.tsx:423 |  |  |
| targets-I06 | text «VD: Marketing Campaign» | `newGroupCost.item_name` | `e => { setNewGroupCost(prev => ({ ...prev, item_name: e.target.value })); setGro` | cost-management-modal.tsx:506 |  |  |
| targets-I07 | number | `newGroupCost.amount // ""` | `e => { setNewGroupCost(prev => ({ ...prev, amount: parseFloat(e.target.value) //` | cost-management-modal.tsx:516 |  |  |
| targets-I08 | text «Tuỳ chọn...» | `newGroupCost.note` | `e => setNewGroupCost(prev => ({ ...prev, note: e.target.value }))` | cost-management-modal.tsx:525 |  |  |

### 2.3 Danh sách chọn (3)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| targets-S01 | `quarter` |  | `e => setQuarter(e.target.value)` | page.tsx:453 |  |  |
| targets-S02 | `costs[cat]?.type ?? "amount"` | VND · % | `e => updateCost(chanName, cat, "type", e.target.value)` | cost-management-modal.tsx:395 |  |  |
| targets-S03 | `newGroupCost.group_name` | B2B · B2C | `e => setNewGroupCost(prev => ({ ...prev, group_name: e.target.value as "B2C" / "` | cost-management-modal.tsx:495 |  |  |

### 2.4 State điều khiển (24)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| savedSnap | `""` | page.tsx:176 |
| loading | `true` | page.tsx:177 |
| saving | `false` | page.tsx:178 |
| savedSnap | `""` | page.tsx:252 |
| loading | `true` | page.tsx:253 |
| saving | `false` | page.tsx:254 |
| canEdit | `false` | page.tsx:334 |
| quarter | `getDefaultQuarter` | page.tsx:347 |
| showCostModal | `false` | page.tsx:348 |
| loading | `false` | page.tsx:349 |
| saving | `false` | page.tsx:350 |
| data | `null` | page.tsx:351 |
| savedSnap | `""` | page.tsx:355 |
| message | `null` | page.tsx:358 |
| costMonth | `initialMonth // new Date().toISOString().slice(0, 7)` | cost-management-modal.tsx:71 |
| groupCosts | `[]` | cost-management-modal.tsx:74 |
| newGroupCost | `{ ...BLANK_GROUP, month: costMonth }` | cost-management-modal.tsx:75 |
| groupFormError | `null` | cost-management-modal.tsx:76 |
| confirmDeleteId | `null` | cost-management-modal.tsx:77 |
| savingCosts | `false` | cost-management-modal.tsx:78 |
| activeCostTab | `scope === "b2c" ? "b2c" : "b2b"` | cost-management-modal.tsx:79 |
| vnEcomSubChannels | `[]` | cost-management-modal.tsx:80 |
| travelokaSubChannels | `[]` | cost-management-modal.tsx:81 |
| shopeepaySubChannels | `[]` | cost-management-modal.tsx:82 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Nhóm`, `(Actual)`, `Target`, `Tháng`, `VN`, `US`, `Total`, `Month`, `🇻🇳 VN (VND)`, `🇺🇸 US (VND)`, `Total (VND)`

**Cột khai báo (label:):** —

## 4. Xuất file

Hàm: —

## 5. Thao tác ghi từ giao diện (9)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| targets-W01 | POST | `"/api/config/b2c-kpi-targets"` | page.tsx:193 |  |  |
| targets-W02 | POST | `"/api/config/b2c-budget"` | page.tsx:269 |  |  |
| targets-W03 | POST | `"/api/planning/targets"` | page.tsx:405 |  |  |
| targets-W04 | POST | `"/api/channel-cost-settings"` | cost-management-modal.tsx:152 |  |  |
| targets-W05 | POST | `"/api/channel-costs"` | cost-management-modal.tsx:199 |  |  |
| targets-W06 | POST | `"/api/channel-costs"` | cost-management-modal.tsx:214 |  |  |
| targets-W07 | POST | `"/api/channel-costs"` | cost-management-modal.tsx:251 |  |  |
| targets-W08 | POST | `"/api/channel-group-costs"` | cost-management-modal.tsx:290 |  |  |
| targets-W09 | DELETE | ``/api/channel-group-costs/${id}`` | cost-management-modal.tsx:319 |  |  |

## 6. Cổng quyền trong giao diện

- `page.tsx:51: canEdit: boolean`
- `page.tsx:54: function PlanningTable({ title, metricType, targets, prevActuals, onChange, data, loading, canEdit }: TablePro`
- `page.tsx:115: {canEdit ? (`
- `page.tsx:172: function B2CKpiTargetSection({ canEdit, onNotify }: { canEdit: boolean; onNotify: (ok: boolean, text: string) `
- `page.tsx:206: {canEdit && <SaveBtn onClick={save} saving={saving} dirty={dirty} />}`
- `page.tsx:227: {canEdit ? (`
- `page.tsx:249: function B2CMarketingBudgetSection({ canEdit, onNotify }: { canEdit: boolean; onNotify: (ok: boolean, text: st`
- `page.tsx:293: {canEdit && <SaveBtn onClick={save} saving={saving} dirty={dirty} />}`
- `page.tsx:312: <td className="px-5 py-3 text-right bg-brand-50/20">{canEdit ? numInput(m, "vn") : <span className="text-sm fo`
- `page.tsx:313: <td className="px-5 py-3 text-right bg-brand-50/20">{canEdit ? numInput(m, "us") : <span className="text-sm fo`
- `page.tsx:334: const [canEdit, setCanEdit] = useState(false)`
- `page.tsx:340: const tabs: string[] = d.writable_tabs ?? []`
- `page.tsx:390: if (!canEdit) return`
- `page.tsx:444: {canEdit && (`
