# Kiểm kê điều khiển: Quarter Report

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/quarterly`
- Tệp quét (16): `app/(dashboard)/analytics/quarterly/page.tsx`, `components/quarterly/kpi-card.tsx`, `components/quarterly/table-head.tsx`, `components/quarterly/col-info.tsx`, `components/quarterly/mom-badge.tsx`, `components/quarterly/month-sub-row.tsx`, `components/quarterly/qt-summary-row.tsx`, `components/quarterly/qt-target-row.tsx`, `components/quarterly/pivot-table.tsx`, `components/quarterly/b2b-tier-section.tsx`, `components/quarterly/customer-lifecycle-section.tsx`, `components/quarterly/qt-vs-target-bullets.tsx`, `components/quarterly/monthly-trend-chart.tsx`, `components/quarterly/squad-monthly-table.tsx`, `components/quarterly/squad-customer-summary.tsx`, `components/quarterly/company-performance-view.tsx`
- Dòng mã: 4807
- Thành phần dùng chung (không quét sâu): `components/dashboard-kit.tsx`
- Thư viện logic import: `lib/utils.ts`, `lib/analytics-formatters.ts`, `lib/use-role-guard.ts`, `lib/quarterly-types.ts`, `lib/quarterly-format.ts`, `lib/export-excel.ts`, `lib/analytics-engine/org-targets.ts`, `lib/analytics-engine/lifecycle-detail.ts`, `lib/quarterly-company-view.ts`

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (15):** `/api/user/me`, `/api/config/squad-config`, `/api/analytics/squad-progress`, `/api/analytics/squad-targets`, `/api/analytics/quarterly-settings`, `/api/analytics/quarterly-report`, `/api/analytics/quarterly-targets`, `/api/analytics/quarterly-b2b-customers`, `/api/analytics/quarterly-cache-flush`, `/api/analytics/quarterly-settings/search-customers`, `/api/analytics/b2b-customer-costs`, `/api/analytics/b2b-customer-orders`, `/api/analytics/b2b-customer-targets`, `/api/analytics/quarterly-customer-lifecycle`, `/api/analytics/company-monthly-targets`

**Bảng/nguồn nhắc trong mã giao diện:** `analytics_channel_costs`, `analytics_channel_group_costs`, `dim_sku`

**Cờ cache/làm mới:** fresh. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (71)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| quarterly-B01 | (icon) | `() => setSelQ(q)` |  | page.tsx:571 |  |  |
| quarterly-B02 | (icon) | `() => setTenantFilter(code)` |  | page.tsx:585 |  |  |
| quarterly-B03 | (icon) | `() => fetchReport()` | `loading` | page.tsx:599 |  |  |
| quarterly-B04 | Tải lại mới | `refreshAll` | `loading // b2bTiersLoading` | page.tsx:604 |  |  |
| quarterly-B05 | Cài đặt | `() => setShowSettings(v => !v)` |  | page.tsx:611 |  |  |
| quarterly-B06 | (icon) | `() => setActiveSection(id as any)` |  | page.tsx:635 |  |  |
| quarterly-B07 | (icon) | `saveSettings` | `savingSettings // !settingsDirty` | page.tsx:663 |  |  |
| quarterly-B08 | (icon) | `() => updateSettings({ excludedCustomers: qSettings.excludedCustomers.filter(n => n !== en` |  | page.tsx:678 |  |  |
| quarterly-B09 | (icon) | `() => { if (newExcluded.trim() && !qSettings.excludedCustomers.includes(newExcluded.trim()` |  | page.tsx:706 |  |  |
| quarterly-B10 | (icon) | `() => { if (!alreadyAdded) { updateSettings({ excludedCustomers: [...qSettings.excludedCus` | `alreadyAdded` | page.tsx:722 |  |  |
| quarterly-B11 | (icon) | `() => updateSettings({ tierKeywords: { ...qSettings.tierKeywords, [tier]: qSettings.tierKe` |  | page.tsx:752 |  |  |
| quarterly-B12 | Target - {!targetCardOpen && targets.b2bRev > 0 && ( B2B Rev: {targets | `() => setTargetCardOpen(v => !v)` |  | page.tsx:778 |  |  |
| quarterly-B13 | Hủy | `cancelEditTarget` |  | page.tsx:797 |  |  |
| quarterly-B14 | (icon) | `saveTargets` | `saving // !targetDirty` | page.tsx:799 |  |  |
| quarterly-B15 | Sửa | `e => { e.stopPropagation(); startEditTarget() }` |  | page.tsx:806 |  |  |
| quarterly-B16 | (icon) | `() => setShowMonthBreakdown(v => !v)` |  | page.tsx:890 |  |  |
| quarterly-B17 | Cấu hình Squad {squadConfig && ( ) } | `() => { if (!editingSquad) { setDraftSquads((squadConfig?.squads ?? []).map(s => ({ name:` |  | page.tsx:1121 |  |  |
| quarterly-B18 | Target Squad — | `() => { if (!editingTargets) openEditTargets(); else setEditingTargets(false) }` |  | page.tsx:1133 |  |  |
| quarterly-B19 | (icon) | `() => setDraftSquads(prev => prev.filter((_, i) => i !== si))` |  | page.tsx:1155 |  |  |
| quarterly-B20 | (icon) | `() => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, sales_pics: s.sales_pic` |  | page.tsx:1180 |  |  |
| quarterly-B21 | (icon) | `() => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, sales_pics: [...s.sales` |  | page.tsx:1192 |  |  |
| quarterly-B22 | Thêm squad | `() => setDraftSquads(prev => [...prev, { name: "", leader: "", sales_pics: [] }])` |  | page.tsx:1209 |  |  |
| quarterly-B23 | (icon) | `saveSquadConfig` | `savingSquad` | page.tsx:1213 |  |  |
| quarterly-B24 | Huỷ | `() => setEditingSquad(false)` |  | page.tsx:1218 |  |  |
| quarterly-B25 | (icon) | `saveSquadTargets` | `savingTargets` | page.tsx:1304 |  |  |
| quarterly-B26 | Huỷ | `() => setEditingTargets(false)` |  | page.tsx:1309 |  |  |
| quarterly-B27 | Export Excel | `exportSquadProgress` | `!squadData?.squads?.length // squadLoading` | page.tsx:1325 |  |  |
| quarterly-B28 | (icon) | `fetchSquadProgress` | `squadLoading` | page.tsx:1329 |  |  |
| quarterly-B29 | (icon) | `() => { if (active) setSqSortDir(d => d === "asc" ? "desc" : "asc"); else { setSqSortCol(c` |  | page.tsx:1378 |  |  |
| quarterly-B30 | (icon) | `() => setSqFilterRegion(v)` |  | page.tsx:1451 |  |  |
| quarterly-B31 | Xóa filter | `() => { setSqSearch(""); setSqFilterRegion("ALL"); setSqFilterTier("ALL"); setSqFilterPic(` |  | page.tsx:1485 |  |  |
| quarterly-B32 | {leaderUser && ( )} KH | `() => setExpandedSquads(prev => { const next = new Set(prev); next.has(si) ? next.delete(s` |  | page.tsx:1581 |  |  |
| quarterly-B33 | (icon) | `() => setExpandedSqCustomers(prev => { const next = new Set(prev); next.has(custKey) ? nex` |  | page.tsx:1654 |  |  |
| quarterly-B34 | i | `e => { e.stopPropagation(); if (!open) show(); else setOpen(false) }` |  | col-info.tsx:24 |  |  |
| quarterly-B35 | (icon) | `onToggle` |  | pivot-table.tsx:49 |  |  |
| quarterly-B36 | (icon) | `() => toggleRow(ch.name)` |  | pivot-table.tsx:91 |  |  |
| quarterly-B37 | B2B — Chi tiết theo Nhóm (Hàng) × Tháng (Cột) {(["ALL", "VN", "US"] as | `onToggle` |  | b2b-tier-section.tsx:644 |  |  |
| quarterly-B38 | {r === "ALL" ? "ALL" : `$ $ `} | `() => onRegionChange(r)` |  | b2b-tier-section.tsx:653 |  |  |
| quarterly-B39 | T | `() => setTierViewMonth(m)` |  | b2b-tier-section.tsx:664 |  |  |
| quarterly-B40 | Cả Quý | `() => setTierViewMonth("QUARTER")` |  | b2b-tier-section.tsx:670 |  |  |
| quarterly-B41 | Export | `exportTierTable` |  | b2b-tier-section.tsx:678 |  |  |
| quarterly-B42 | Template | `downloadTemplate` |  | b2b-tier-section.tsx:684 |  |  |
| quarterly-B43 | Import | `() => importFileRef.current?.click()` | `importLoading` | b2b-tier-section.tsx:688 |  |  |
| quarterly-B44 | Lưu | `saveCost` | `savingCost // !costDirty` | b2b-tier-section.tsx:698 |  |  |
| quarterly-B45 | Hủy | `cancelCostEdit` | `savingCost` | b2b-tier-section.tsx:703 |  |  |
| quarterly-B46 | Sửa chi tiết | `() => { if (!expanded) onToggle(); startCostEdit() }` |  | b2b-tier-section.tsx:709 |  |  |
| quarterly-B47 | Xuất Excel{custSearch ? ` (khớp "$ ")` : ""} | `exportCustomerDetail` |  | b2b-tier-section.tsx:878 |  |  |
| quarterly-B48 | Nhập target cho cả Organization (mã con không nhập riêng) | `e => { e.stopPropagation(); startEditTarget(orgTk) }` |  | b2b-tier-section.tsx:955 |  |  |
| quarterly-B49 | Lưu | `() => saveTarget(orgTk, stripOrgPrefix(item.orgName))` | `orgSaving` | b2b-tier-section.tsx:984 |  |  |
| quarterly-B50 | Hủy | `cancelEditTarget` |  | b2b-tier-section.tsx:987 |  |  |
| quarterly-B51 | Nhập chi phí | `() => openCostModal(c)` |  | b2b-tier-section.tsx:1079 |  |  |
| quarterly-B52 | (icon) | `() => startEditTarget(tkey)` |  | b2b-tier-section.tsx:1262 |  |  |
| quarterly-B53 | Lưu | `() => saveTarget(tkey, inMultiOrg ? stripOrgPrefix(c.orgName // c.name) : c.name)` | `isSavingTgt` | b2b-tier-section.tsx:1269 |  |  |
| quarterly-B54 | Hủy | `cancelEditTarget` |  | b2b-tier-section.tsx:1273 |  |  |
| quarterly-B55 | (icon) | `() => { setOrdersGroupBy(prev => ({ ...prev, [c.code]: gbOpt })); loadOrders(c, gbOpt) }` |  | b2b-tier-section.tsx:1385 |  |  |
| quarterly-B56 | Biểu đồ | `() => setOrdersShowChart(prev => ({ ...prev, [c.code]: !prev[c.code] }))` |  | b2b-tier-section.tsx:1391 |  |  |
| quarterly-B57 | Tải số liệu → | `() => loadOrders(c, "month")` |  | b2b-tier-section.tsx:1399 |  |  |
| quarterly-B58 | (icon) | `closeCostModal` |  | b2b-tier-section.tsx:1490 |  |  |
| quarterly-B59 | Thêm | `() => addLine(m)` |  | b2b-tier-section.tsx:1503 |  |  |
| quarterly-B60 | (icon) | `() => removeLine(m, idx)` |  | b2b-tier-section.tsx:1530 |  |  |
| quarterly-B61 | Xong | `closeCostModal` |  | b2b-tier-section.tsx:1546 |  |  |
| quarterly-B62 | 0 // value !== "—" ? [ ] : []), ...extra, ]} /> | `() => openTile(segment, state)` |  | customer-lifecycle-section.tsx:110 |  |  |
| quarterly-B63 | CSV | `exportCsv` | `!stateDetail` | customer-lifecycle-section.tsx:180 |  |  |
| quarterly-B64 | Đóng danh sách | `() => setOpen(null)` |  | customer-lifecycle-section.tsx:184 |  |  |
| quarterly-B65 | KH đang mua · | `() => toggle("all")` |  | squad-customer-summary.tsx:67 |  |  |
| quarterly-B66 | `Xem ${n} KH tier ${t}` | `() => toggle(t)` | `n === 0` | squad-customer-summary.tsx:73 |  |  |
| quarterly-B67 | x.tip | `() => toggle(x.k)` |  | squad-customer-summary.tsx:83 |  |  |
| quarterly-B68 | Đóng danh sách | `() => setView(null)` |  | squad-customer-summary.tsx:103 |  |  |
| quarterly-B69 | Target | `() => (active ? setEditing(false) : openEdit(which))` |  | company-performance-view.tsx:215 |  |  |
| quarterly-B70 | (icon) | `save` | `saving` | company-performance-view.tsx:258 |  |  |
| quarterly-B71 | Huỷ | `() => setEditing(false)` |  | company-performance-view.tsx:263 |  |  |

### 2.2 Ô nhập và hộp tích (22)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| quarterly-I01 | checkbox | `val` | `e => set(e.target.checked)` | page.tsx:595 |  |  |
| quarterly-I02 | text «Tìm tên hoặc mã KH…» | `newExcluded` | `async e => { setNewExcluded(e.target.value) const q = e.target.value.trim() if (` | page.tsx:686 |  |  |
| quarterly-I03 | text «+ từ khóa (Enter)» |  |  | page.tsx:757 |  |  |
| quarterly-I04 | text | `(tgtInputs as any)[f.id]` | `e => setTgtInputs(prev => ({ ...prev, [f.id]: e.target.value }))` | page.tsx:828 |  |  |
| quarterly-I05 | text «Tên squad (VD: Squad 1 Ngọc)» | `sq.name` | `e => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, name: e.target` | page.tsx:1152 |  |  |
| quarterly-I06 | text «0» | `showDigits(t[f])` | `e => upd(f, e.target.value)` | page.tsx:1248 |  |  |
| quarterly-I07 | text «0» | `showDigits(v)` | `e => setMonth(i, e.target.value)` | page.tsx:1291 |  |  |
| quarterly-I08 | text «Tìm khách hàng...» | `sqSearch` | `e => setSqSearch(e.target.value)` | page.tsx:1445 |  |  |
| quarterly-I09 | file |  | `e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }` | b2b-tier-section.tsx:676 |  |  |
| quarterly-I10 | text «Tìm tên, mã KH...» | `custSearch` | `e => setCustSearch(e.target.value)` | b2b-tier-section.tsx:872 |  |  |
| quarterly-I11 | text «VD: 2.000.000.000» | `oInp.rev` | `e => setOInp({ rev: e.target.value })` | b2b-tier-section.tsx:980 |  |  |
| quarterly-I12 | text «VD: 500.000.000» | `oInp.cm1` | `e => setOInp({ cm1: e.target.value })` | b2b-tier-section.tsx:981 |  |  |
| quarterly-I13 | number «VD: 70.0» | `oInp.thk` | `e => setOInp({ thk: e.target.value })` | b2b-tier-section.tsx:982 |  |  |
| quarterly-I14 | text «để trống = Doanh thu × 3HK%» | `oInp.hk3rev` | `e => setOInp({ hk3rev: e.target.value })` | b2b-tier-section.tsx:983 |  |  |
| quarterly-I15 | text «VD: 2.000.000.000» — ) : tgt.rev > 0 ? ( | `targetInputs[tkey]?.rev ?? ""` | `e => setTargetInputs(prev => ({ ...prev, [tkey]: { ...(prev[tkey] ?? { cm1: "",` | b2b-tier-section.tsx:1284 |  |  |
| quarterly-I16 | text «VD: 500.000.000» — ) : tgt.cm1 > 0 ? ( | `targetInputs[tkey]?.cm1 ?? ""` | `e => setTargetInputs(prev => ({ ...prev, [tkey]: { ...(prev[tkey] ?? { cm1: "",` | b2b-tier-section.tsx:1309 |  |  |
| quarterly-I17 | number «VD: 70.0» — ) : tgt.thk > 0 ? ( | `targetInputs[tkey]?.thk ?? ""` | `e => setTargetInputs(prev => ({ ...prev, [tkey]: { ...(prev[tkey] ?? { cm1: "",` | b2b-tier-section.tsx:1334 |  |  |
| quarterly-I18 | text «VD: 1.500.000.000» — {tgt.rev > 0 && tgt.thk > 0 && ( | `targetInputs[tkey]?.hk3rev ?? ""` | `e => setTargetInputs(prev => ({ ...prev, [tkey]: { ...(prev[tkey] ?? { cm1: "",` | b2b-tier-section.tsx:1355 |  |  |
| quarterly-I19 | text «Ghi chú» | `l.label` | `e => setLine(m, idx, { label: e.target.value })` | b2b-tier-section.tsx:1517 |  |  |
| quarterly-I20 | number «0» — {(l.value as number) | `l.value // ""` | `e => setLine(m, idx, { value: parseFloat(e.target.value) // 0 })` | b2b-tier-section.tsx:1525 |  |  |
| quarterly-I21 | text «Tìm tên / mã / PIC…» | `q` | `e => setQ(e.target.value)` | customer-lifecycle-section.tsx:177 |  |  |
| quarterly-I22 | text «0» | `showDigits(draft[seg][f][i])` | `e => setCell(seg, f, i, e.target.value)` | company-performance-view.tsx:248 |  |  |

### 2.3 Danh sách chọn (7)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| quarterly-S01 | `selYear` |  | `e => setSelYear(parseInt(e.target.value))` | page.tsx:577 |  |  |
| quarterly-S02 | `sq.leader ?? ""` | — Chọn leader — · (@ ) | `e => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, leader: e.targ` | page.tsx:1162 |  |  |
| quarterly-S03 | `sqFilterTier` | Tất cả tier | `e => setSqFilterTier(e.target.value)` | page.tsx:1457 |  |  |
| quarterly-S04 | `sqFilterSquad` | Tất cả squad | `e => setSqFilterSquad(e.target.value)` | page.tsx:1463 |  |  |
| quarterly-S05 | `sqFilterPic` | Tất cả PIC | `e => setSqFilterPic(e.target.value)` | page.tsx:1470 |  |  |
| quarterly-S06 | `sqFilterRisk` | Tất cả rủi ro | `e => setSqFilterRisk(e.target.value)` | page.tsx:1479 |  |  |
| quarterly-S07 | `l.type` | đ · % | `e => setLine(m, idx, { type: e.target.value as "amount" / "percent" })` | b2b-tier-section.tsx:1519 |  |  |

### 2.4 State điều khiển (70)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| selQ | ``Q${Math.ceil((today.getMonth() + 1) / 3)}`` | page.tsx:81 |
| selYear | `today.getFullYear()` | page.tsx:82 |
| includeShip | `true` | page.tsx:83 |
| includeInternalOps | `true` | page.tsx:84 |
| report | `null` | page.tsx:85 |
| loading | `false` | page.tsx:86 |
| saving | `false` | page.tsx:87 |
| msg | `null` | page.tsx:88 |
| targets | `EMPTY_TARGETS` | page.tsx:89 |
| tgtInputs | `{ b2bRev: "", b2bCm1: "", b2bThk: "", b2cRev: "", b2cCm1: ""` | page.tsx:90 |
| expandB2B | `true` | page.tsx:91 |
| expandB2C | `false` | page.tsx:92 |
| b2bRegion | `"ALL"` | page.tsx:93 |
| companyCode | `"ALL"` | page.tsx:94 |
| b2bTiers | `null` | page.tsx:96 |
| b2bTiersLoading | `false` | page.tsx:97 |
| userRole | `""` | page.tsx:98 |
| editTarget | `false` | page.tsx:99 |
| showSettings | `false` | page.tsx:116 |
| settingsDirty | `false` | page.tsx:117 |
| savingSettings | `false` | page.tsx:118 |
| newExcluded | `""` | page.tsx:119 |
| custSuggestions | `[]` | page.tsx:120 |
| loadingSugg | `false` | page.tsx:121 |
| activeSection | `"overview"` | page.tsx:124 |
| squadData | `null` | page.tsx:125 |
| squadLoading | `false` | page.tsx:126 |
| squadConfig | `null` | page.tsx:127 |
| squadUsers | `[]` | page.tsx:128 |
| editingSquad | `false` | page.tsx:129 |
| draftSquads | `[]` | page.tsx:130 |
| savingSquad | `false` | page.tsx:131 |
| squadMsg | `null` | page.tsx:132 |
| sqSearch | `""` | page.tsx:136 |
| sqFilterRegion | `"ALL"` | page.tsx:137 |
| sqFilterTier | `"ALL"` | page.tsx:138 |
| sqFilterPic | `"ALL"` | page.tsx:139 |
| sqFilterRisk | `"ALL"` | page.tsx:140 |
| sqFilterSquad | `"ALL"` | page.tsx:141 |
| sqSortCol | `"risk_level"` | page.tsx:142 |
| sqSortDir | `"asc"` | page.tsx:143 |
| editingTargets | `false` | page.tsx:145 |
| savingTargets | `false` | page.tsx:149 |
| showMonthBreakdown | `false` | page.tsx:152 |
| targetCardOpen | `false` | page.tsx:153 |
| open | `false` | col-info.tsx:10 |
| pos | `{ top: 0, left: 0 }` | col-info.tsx:11 |
| selectedTier | `null` | b2b-tier-section.tsx:61 |
| custSearch | `""` | b2b-tier-section.tsx:62 |
| editMode | `false` | b2b-tier-section.tsx:63 |
| costCust | `null` | b2b-tier-section.tsx:64 |
| costEdits | `{}` | b2b-tier-section.tsx:65 |
| costSnapshot | `""` | b2b-tier-section.tsx:66 |
| savingCost | `false` | b2b-tier-section.tsx:67 |
| importLoading | `false` | b2b-tier-section.tsx:68 |
| importMsg | `""` | b2b-tier-section.tsx:69 |
| tierViewMonth | `"QUARTER"` | b2b-tier-section.tsx:75 |
| editingTargetCode | `null` | b2b-tier-section.tsx:214 |
| savingTargetCode | `null` | b2b-tier-section.tsx:216 |
| open | `null` | customer-lifecycle-section.tsx:41 |
| q | `""` | customer-lifecycle-section.tsx:44 |
| view | `null` | squad-customer-summary.tsx:22 |
| loading | `false` | company-performance-view.tsx:69 |
| err | `null` | company-performance-view.tsx:70 |
| targets | `{}` | company-performance-view.tsx:71 |
| editing | `false` | company-performance-view.tsx:72 |
| editQ | `{ q: 0, year: 0 }` | company-performance-view.tsx:74 |
| draft | `emptyDraft()` | company-performance-view.tsx:76 |
| saving | `false` | company-performance-view.tsx:77 |
| msg | `null` | company-performance-view.tsx:78 |

## 3. Bảng và cột

**Tiêu đề cột (th):** `Squad`, `Target Revenue (VND)`, `Target GP (VND)`, `Target CM1 (VND)`, `Target 3HK Rev (VND)`, `Chỉ số`, `T (VND)`, `Squad · PIC`, `Tier`, `CM1 PR`, `CM1 Tgt`, `3HK PR / Tgt%`, `Khách hàng`, `PIC · Tier`, `Rev PR`, `CM1%`, `%TGT CM1`, `3HK% / Tgt%`, `%TGT 3HK`, `Đánh giá`, `{tip && }`, `Kênh`, `T /`, `{months.flatMap(m => SUB.map((h, i) => (`, `Nhóm`, `Tổng Quý`, `{col.tip && }`, `Mã KH`, `Tên KH`, `Bảng giá`, `Revenue`, `G.Margin`, `GM%`, `Ch.Cost`, `CM1`, `%Tgt CM1`, `%CM1`, `%QoQ`, `3HK%`, `3HK Rev TGT`, `Act`, `PR`, `SL`, `Đơn`, `GP`, `GP%`, `#`, `DT quý này`, `DT quý trước`, `Đơn đầu`, `Đơn gần nhất`, `{leader && }`, `{nextQuarter.months.map(m => ( (target)`, `Target +%QoQ`, `Quý trước`, `Đơn đầu tiên`, `: ( {c.tag && ( ) }`

**Cột khai báo (label:):** `Tháng`, `Revenue`, `PR Rev`, `Gross Margin`, `GM%`, `Channel Cost`, `Group Cost`, `CM1`, `PR CM1`, `CM1%`, `%QoQ CM1`, `3HK%`, `Chỉ số Quý`, `Proj.Rev`, `GP`, `GP%`, `Ch.Cost`, `Gr.Cost`, `Proj.CM1`, `QoQ`, `Rất an toàn`, `An toàn`, `An toàn ít`, `Nguy hiểm ít`, `Nguy hiểm nhiều`, `Chưa có target`, `B2B Doanh thu`, `B2B CM1 (VND)`, `B2B %3HK`, `B2C Doanh thu`, `B2C CM1 (VND)`, `B2C %3HK`, `Việt Nam (VND)`, `Quốc tế (USD)`, `%CM1`, `%QoQ(CM1)`, `%MoM`, `Tổng Quý`, `G.Margin`, `3HK`, `Có mua quý trước`, `3HK/Datapool`, `KH mới trong quý`, `KH cũ tiếp tục mua`, `KH cũ quay lại sau gián đoạn`, `KH cũ chưa quay lại`

## 4. Xuất file

Hàm: `exportSquadProgress`, `exportAOA`, `exportTierTable`, `exportCustomerDetail`, `exportCsv`

## 5. Thao tác ghi từ giao diện (9)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| quarterly-W01 | POST | `"/api/config/squad-config"` | page.tsx:236 |  |  |
| quarterly-W02 | POST | `"/api/analytics/squad-targets"` | page.tsx:291 |  |  |
| quarterly-W03 | POST | `"/api/analytics/quarterly-settings"` | page.tsx:335 |  |  |
| quarterly-W04 | POST | `"/api/analytics/quarterly-cache-flush"` | page.tsx:411 |  |  |
| quarterly-W05 | POST | `"/api/analytics/quarterly-targets"` | page.tsx:423 |  |  |
| quarterly-W06 | POST | `"/api/analytics/b2b-customer-costs"` | b2b-tier-section.tsx:190 |  |  |
| quarterly-W07 | POST | `"/api/analytics/b2b-customer-targets"` | b2b-tier-section.tsx:543 |  |  |
| quarterly-W08 | POST | `"/api/analytics/b2b-customer-costs"` | b2b-tier-section.tsx:624 |  |  |
| quarterly-W09 | POST | `"/api/analytics/company-monthly-targets"` | company-performance-view.tsx:179 |  |  |

## 6. Cổng quyền trong giao diện

- `page.tsx:110: const canEditCost  = ["admin", "creator", "bod", "b2b", "b2c", "staff"].includes(userRole)`
- `page.tsx:111: const isCreator    = userRole === "creator"`
- `page.tsx:112: const canEditSettings = ["admin", "creator"].includes(userRole)`
- `page.tsx:325: if (!canEditSettings) return`
- `page.tsx:329: }, [canEditSettings])`
- `page.tsx:610: {canEditSettings && (`
- `page.tsx:659: {canEditSettings && showSettings && qSettings && (`
- `page.tsx:794: {canEditCost && targetCardOpen && (`
- `page.tsx:1082: canEditCost={canEditCost}`
- `page.tsx:1083: isCreator={isCreator}`
- `page.tsx:1117: {canEditSettings && (`
- `page.tsx:1144: {canEditSettings && editingSquad && (`
- `page.tsx:1224: {canEditSettings && editingTargets && squadData?.squads?.length > 0 && (`
- `page.tsx:1343: Chưa có squad nào. {canEditSettings && <span>Dùng nút <b className="text-slate-600">Cấu hình Squad</b> bên trê`
- `b2b-tier-section.tsx:58: export function B2BTierSection({ b2bTiers, loading, months, allMonths, region, onRegionChange, expanded, onTog`
- `b2b-tier-section.tsx:60: canEditCost?: boolean; isCreator?: boolean; onSaved?: () => void; notify?: (ok: boolean, text: string) => void`
- `b2b-tier-section.tsx:682: {canEditCost && !editMode && (`
- `b2b-tier-section.tsx:695: {canEditCost && (`
- `b2b-tier-section.tsx:908: {isCreator && <th className="px-1.5 py-1.5 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wi`
- `b2b-tier-section.tsx:910: {isCreator && <th className="px-1.5 py-1.5 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wi`
- `b2b-tier-section.tsx:949: <td colSpan={isCreator ? 2 : 1} className="px-1.5 py-1.5">`
- `b2b-tier-section.tsx:954: {canEditCost && !orgEditing && (`
- `b2b-tier-section.tsx:962: {isCreator && <td />}`
- `b2b-tier-section.tsx:977: <td colSpan={12 + (isCreator ? 2 : 0)} className="px-3 py-2">`
- `b2b-tier-section.tsx:1031: const canEditTgtHere = !!canEditCost && (!inMultiOrg || !item.member)`
- `b2b-tier-section.tsx:1034: const colSpanAll = 12 + (isCreator ? 2 : 0)`
- `b2b-tier-section.tsx:1040: {isCreator && <td className="px-1.5 py-1 font-mono text-slate-400 whitespace-nowrap text-[9px]">{c.code}</td>}`
- `b2b-tier-section.tsx:1042: {isCreator && <td className="px-1.5 py-1" />}`
- `company-performance-view.tsx:26: canEdit: boolean`
- `company-performance-view.tsx:56: export function CompanyPerformanceView({ selQ, selYear, companyCode, includeShip, includeInternalOps, report, `
- `company-performance-view.tsx:212: {canEdit && ([["cur", q, selYear, curLabel], ...(hasNext ? [["next", nextQ, nextYear, nextLabel] as const] : [`
