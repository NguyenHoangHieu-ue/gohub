# Kiểm kê điều khiển: Scheduled Messages

> Sinh bởi `web/scripts/qa/inventory.mjs` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.

- URL: `/analytics/scheduled`
- Tệp quét (1): `app/(dashboard)/analytics/scheduled/page.tsx`
- Dòng mã: 376
- Thành phần dùng chung (không quét sâu): `components/toast.tsx`, `components/dashboard-kit.tsx`
- Thư viện logic import: —

## 1. API và nguồn dữ liệu

**Route gọi từ giao diện (2):** `/api/admin/scheduled-messages`, `/api/user/me`

**Bảng/nguồn nhắc trong mã giao diện:** —

**Cờ cache/làm mới:** —. **localStorage:** —

## 2. Điều khiển

### 2.1 Nút (9)

| ID | Nhãn | onClick | Điều kiện khoá | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| scheduled-B01 | (icon) | `cancel` |  | page.tsx:211 |  |  |
| scheduled-B02 | Huỷ | `cancel` |  | page.tsx:282 |  |  |
| scheduled-B03 | (icon) | `handleSave` |  | page.tsx:283 |  |  |
| scheduled-B04 | (icon) | `handleCreateWeeklyReport` | `generatingReport` | page.tsx:299 |  |  |
| scheduled-B05 | Lịch mới | `startAdding` |  | page.tsx:306 |  |  |
| scheduled-B06 | (icon) | `() => toggleActive(msg)` |  | page.tsx:334 |  |  |
| scheduled-B07 | Test ngay | `() => handleTest(msg.id)` | `testingId === msg.id` | page.tsx:358 |  |  |
| scheduled-B08 | Sửa | `() => startEditing(msg)` |  | page.tsx:362 |  |  |
| scheduled-B09 | Xoá | `() => handleDelete(msg.id)` |  | page.tsx:363 |  |  |

### 2.2 Ô nhập và hộp tích (5)

| ID | Loại / nhãn | Gắn với | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| scheduled-I01 | text «VD: Báo cáo doanh thu hằng ngày» | `formData.name // ""` | `e => setFormData({ ...formData, name: e.target.value })` | page.tsx:216 |  |  |
| scheduled-I02 | time — )} {scheduleMode === "weekly" && ( | `scheduleTime` | `e => setScheduleTime(e.target.value)` | page.tsx:231 |  |  |
| scheduled-I03 | text «VD: 0 8 * * 1-5» — )} | `customCron` | `e => setCustomCron(e.target.value)` | page.tsx:248 |  |  |
| scheduled-I04 | text «https://open.larksuite.com/open-apis/bot/v2/hook/...» | `formData.lark_webhook_url // ""` | `e => setFormData({ ...formData, lark_webhook_url: e.target.value })` | page.tsx:259 |  |  |
| scheduled-I05 | text «VD: openthemagicgate» | `formData.lark_keyword // ""` | `e => setFormData({ ...formData, lark_keyword: e.target.value })` | page.tsx:267 |  |  |

### 2.3 Danh sách chọn (3)

| ID | Giá trị đang chọn | Lựa chọn | onChange | Vị trí | Hiệu ứng mong đợi | Kết quả QA |
|---|---|---|---|---|---|---|
| scheduled-S01 | `scheduleMode` | Hằng ngày · Hằng tuần · Hằng tháng · Custom (Cron) | `e => setScheduleMode(e.target.value)` | page.tsx:223 |  |  |
| scheduled-S02 | `scheduleDayOfWeek` | Thứ 2 · Thứ 3 · Thứ 4 · Thứ 5 · Thứ 6 · Thứ 7 · Chủ nhật | `e => setScheduleDayOfWeek(e.target.value)` | page.tsx:235 |  |  |
| scheduled-S03 | `scheduleDayOfMonth` | Ngày | `e => setScheduleDayOfMonth(e.target.value)` | page.tsx:242 |  |  |

### 2.4 State điều khiển (12)

| State | Giá trị đầu | Vị trí |
|---|---|---|
| canEdit | `false` | page.tsx:51 |
| messages | `[]` | page.tsx:70 |
| loading | `true` | page.tsx:71 |
| testingId | `null` | page.tsx:72 |
| generatingReport | `false` | page.tsx:73 |
| isEditing | `null` | page.tsx:74 |
| isAdding | `false` | page.tsx:75 |
| scheduleMode | `"daily"` | page.tsx:78 |
| scheduleTime | `"08:00"` | page.tsx:79 |
| scheduleDayOfWeek | `"1"` | page.tsx:80 |
| scheduleDayOfMonth | `"1"` | page.tsx:81 |
| customCron | `""` | page.tsx:82 |

## 3. Bảng và cột

**Tiêu đề cột (th):** —

**Cột khai báo (label:):** `Trạng thái`, `Tên & Lịch`, `Prompt`, `Người tạo`, `Lần chạy cuối`, `Thao tác`

## 4. Xuất file

Hàm: —

## 5. Thao tác ghi từ giao diện (4)

| ID | Phương thức | URL | Vị trí | Quyền / hiệu ứng | Kết quả QA |
|---|---|---|---|---|---|
| scheduled-W01 | DELETE | ``${BASE}/${id}`` | page.tsx:128 |  |  |
| scheduled-W02 | POST | ``${BASE}/${id}`` | page.tsx:138 |  |  |
| scheduled-W03 | POST | ``${BASE}/weekly-report`` | page.tsx:165 |  |  |
| scheduled-W04 | PUT | ``${BASE}/${msg.id}`` | page.tsx:180 |  |  |

## 6. Cổng quyền trong giao diện

- `page.tsx:51: const [canEdit, setCanEdit] = useState<boolean>(false)`
- `page.tsx:57: const tabs: string[] = d.writable_tabs ?? []`
- `page.tsx:65: return <ScheduledMessages canEdit={canEdit} />`
- `page.tsx:68: function ScheduledMessages({ canEdit }: { canEdit: boolean }) {`
- `page.tsx:297: {canEdit && !isAdding && !isEditing && (`
- `page.tsx:333: key: "status", label: "Trạng thái", render: msg => canEdit ? (`
- `page.tsx:355: ...(canEdit ? [{`
