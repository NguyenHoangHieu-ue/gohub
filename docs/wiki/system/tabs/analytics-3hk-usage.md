---
title: "3HK Data Usage (Theo Dõi Tiêu Hao Data 3HK)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, 3hk]
created: 2026-06-28
updated: 2026-09-22
status: active
---

# 3HK Data Usage (Theo Dõi Tiêu Hao Data 3HK)

Trang theo dõi chi tiết **dung lượng data thực tế tiêu thụ** của SIM/eSIM thuộc nhà mạng đối tác **3HK**, đối chiếu với định mức gói đã bán. 3HK là dòng chiến lược (2 key metric của team Business: **CM1** + **3HK Contribution %**).

> **Tài liệu này viết đủ để KHÔNG cần đọc code.** Nếu bạn chỉ cần câu SQL → nhảy tới [mục 5](#5-câu-query-thật-tab-sinh-ra). Nếu cần hiểu vì sao số khớp/ lệch báo cáo NCC → [mục 4](#4-cách-đếm--định-nghĩa-kỳ) và [mục 8](#8-đối-chiếu-báo-cáo-ncc).

---

## 1. Đường dẫn & File

| Thành phần | Vị trí |
|---|---|
| **Trang web** | `/analytics/3hk-usage` |
| **File FE** | `web/src/app/(dashboard)/analytics/3hk-usage/page.tsx` |
| **API dữ liệu bảng** | `POST /api/analytics/query` (SELECT-only) — FE tự sinh SQL rồi gửi (nguồn `gohub_dw`) |
| **API meta sub-variant Unlimited** | `POST /api/analytics/3hk-sku-meta` (s202) — tra `data`/`speed`/`throttle_speed` từ Supabase `skus` cho 1 list sku_code, xem §3.1d |
| **Bảng nguồn (analytics)** | `gohub_dw.fact_data_usage` + `gohub_dw.dim_sku` |

> ⚠️ **s200+4**: route `GET /api/analytics/3hk-speed-map` (nhóm tốc độ Unlimited theo `skus.throttle_speed`,
> chỉ nhận diện được mã A/B qua regex) đã XOÁ — breakdown Unlimited đổi gom theo ký tự phân loại vị trí
> 8/10 của SKU (xem §3.1/§7).
> **s202**: quay lại tra Supabase `skus`, nhưng khác hẳn route cũ — route mới (`3hk-sku-meta`) chỉ tra
> đúng 2 cột nguồn thật `data`/`speed` (không đoán qua regex) cho ĐÚNG list sku_code đang hiển thị, dùng
> để tách sub-variant TRONG mỗi ký tự (xem §3.1d), không thay thế cách phân loại theo ký tự ở §3.1.

> ⚠️ **Không còn** route `/api/analytics/3hk-usage/report` — đã xoá (dead code). Trang gửi thẳng SQL qua `/api/analytics/query`.

---

## 2. Phân quyền
- Xem được: **Admin, Creator, Manager, BOD, Staff** (+ ops-&-cs, product theo `DEFAULT_ROLE_PERMISSIONS`).
- Bảng lấy qua `/api/analytics/query` → allow-list role của endpoint đó **phải gồm `creator`**; thiếu thì creator vào trang nhưng bảng rỗng (403 âm thầm).

---

## 3. Cột dữ liệu chính trong `fact_data_usage`

| Cột | Ý nghĩa | Dùng làm gì trong tab |
|---|---|---|
| `iccid` | Số định danh SIM | Đếm SIM; 1 iccid = 1 order_code (không nhân đôi) |
| `order_code` | Mã đơn | Ghép với iccid thành "bundle" |
| `sku` | Mã gói dùng thực tế | Phân loại gói + nhóm tốc độ |
| `sku_type` | Loại gói (Daily/Fixed/Unlimited Data) | Phân loại (nhưng **tin `sku` hơn** — xem 3.1) |
| `total_data_gb` | **Dung lượng data đã dùng** của bản ghi (GB) | Cộng ra "Total Actual" |
| `data_amount_gb` | **Định mức/capacity** của gói (GB) | "Total Plan" |
| **`first_report_date`** | **⭐ Ngày báo cáo lưu lượng** (snapshot) — lưu ở **00:00:00 UTC** | **CỘT LỌC KỲ CHÍNH** (xem mục 4) |
| `activation_date` | Ngày kích hoạt SIM | **CHỈ hiển thị** ("Acts: …"), KHÔNG dùng lọc kỳ |

### 3.1 Phân loại loại gói (Daily/Fixed/Unlimited) — s200+3 (2026-09-17)

> ⚠️ **Fix root cause thật** — Hiếu báo mã `X` (và tương tự) là Unlimited nhưng bị xếp Daily, kèm bảng
> mapping cấu trúc SKU chuẩn 13 ký tự. Verify trực tiếp SQL trên staging: field quyết định loại gói là
> **1 ký tự ở VỊ TRÍ 8** của SKU CODE 13 ký tự (`SKU CODE = [VN/US][Type][Country(3)][Vendor(2)]
> [DataType(1)][DataAmount(3)][DayAmount(2)]`). Bản CŨ chỉ nhận diện Unlimited qua substring `%UNL%` trong
> toàn chuỗi — đúng cho `A`/`B` (vì trường DataAmount ở vị trí 9-11 CŨNG ghi literal `"UNL"`, vd
> `EACHN3DBUNL05`) nhưng **SAI cho `C`/`D`/`E`/`G`/`H`/`L`/`X`** — các mã này KHÔNG có `"UNL"` ở đâu
> trong chuỗi (vd `EAANZ3DX00303`) → rơi về cột `sku_type` gán sẵn từ nguồn 3HK, vốn gán theo tên gọi phụ
> (bị "Daily"/"Fixed" đánh lừa dù bản chất là Unlimited — comment cũ ở `3hk-speed-map/route.ts` đã ghi
> nhận hiện tượng "mã MỚI bị gán nhầm 'Daily'" từ trước nhưng chưa fix ở chỗ chính này).

**Bảng mapping ký tự vị trí 8** (Hiếu cung cấp, đã verify khớp dữ liệu thật qua SQL — Fixed -5235 SIM
đúng số SKU `K` khi test ban đầu, Daily -26 = Unlimited +26 đúng số SKU `X`, khớp tuyệt đối):

| Ký tự | Ý nghĩa gốc | Category |
|---|---|---|
| A | Daily - Unlimited 5mbps | **Unlimited Data** |
| B | Daily - Unlimited 10mbps | **Unlimited Data** |
| C | Unlimited 20mbps | **Unlimited Data** |
| D | Unlimited 100mbps | **Unlimited Data** |
| E | Fixed - Unlimited 5mbps | **Unlimited Data** |
| G | Fixed - Unlimited 10mbps | **Unlimited Data** |
| H | Unlimited 5mbps | **Unlimited Data** |
| L | Unlimited 50mbps | **Unlimited Data** |
| X | Daily Unlimited 10mbps - Midnight | **Unlimited Data** |
| F | Fixed throttle <2mbps | Fixed Data |
| Y | Fixed no-throttle | Fixed Data |
| P | Daily throttle <2mbps | Daily Data |
| Z | Daily no-throttle | Daily Data |
| T | Daily throttle <2mbps - Midnight | Daily Data |
| K | For esim profile and sim frame | **LOẠI HẲN khỏi báo cáo** (s200+4 — Hiếu xác nhận đây là "khung SIM", không phải gói data thật, xem dưới) |

Quy tắc: **nếu tên gọi có chữ "Unlimited" → LUÔN xếp Unlimited**, bất kể có kèm "Daily"/"Fixed" hay không
(2 chữ đó ở đây chỉ nói về chu kỳ RESET của mức throttle, không phải bản chất dung lượng có giới hạn hay
không). Chỉ áp dụng cho SKU **13 ký tự** (chuẩn hiện tại); mã CŨ 14/15 ký tự giữ nguyên logic literal
`%UNL%` (tự mô tả rõ bằng chữ "GB"/"UNL" trong chuỗi, không cần đổi).

```sql
-- WHERE của period_records (bundlesCTE) — loại hẳn mã khung SIM TRƯỚC khi tính bất kỳ số liệu nào:
AND NOT (LENGTH(sku) = 13 AND SUBSTRING(sku, 8, 1) = 'K')

-- CASE phân loại category (SKU_TYPE_CASE) — K đã bị loại ở WHERE nên không cần nhánh riêng nữa:
CASE
  WHEN LENGTH(sku) = 13 THEN
    CASE SUBSTRING(sku, 8, 1)
      WHEN 'A' THEN 'Unlimited Data' WHEN 'B' THEN 'Unlimited Data' WHEN 'C' THEN 'Unlimited Data'
      WHEN 'D' THEN 'Unlimited Data' WHEN 'E' THEN 'Unlimited Data' WHEN 'G' THEN 'Unlimited Data'
      WHEN 'H' THEN 'Unlimited Data' WHEN 'L' THEN 'Unlimited Data' WHEN 'X' THEN 'Unlimited Data'
      WHEN 'F' THEN 'Fixed Data' WHEN 'Y' THEN 'Fixed Data'
      WHEN 'P' THEN 'Daily Data' WHEN 'Z' THEN 'Daily Data' WHEN 'T' THEN 'Daily Data'
      ELSE sku_type
    END
  WHEN UPPER(sku) LIKE '%UNL%' THEN 'Unlimited Data'
  ELSE sku_type
END
```

**`daysOfSku()` (FE, dùng cho cột "GB/ngày/SIM" ở tab Unlimited) cùng đợt fix**: trước chỉ nhận diện số
ngày qua literal `UNLxx`/`xxD` ở cuối chuỗi → bỏ sót toàn bộ mã 13 ký tự không có `"UNL"` (C/D/E/G/H/L/X)
→ cột luôn hiện "—" cho các mã này. Thêm fallback đọc **2 ký tự cuối** của SKU 13 ký tự (vị trí
DayAmount) khi 2 pattern cũ không khớp — verify khớp cả SKU Fixed/Daily 13 ký tự khác (vd `...F01215` →
"15" ngày) nên áp dụng chung, không chỉ riêng Unlimited.

**s200+4 (cùng ngày) — loại hẳn mã khung SIM + đổi chart/breakdown sang mã ký tự (thay cho "Other" bucket
và giả thuyết chưa xử lý ở đợt trước)**:
- SKU `1D0003DK00000` (mã `K`) — **Hiếu xác nhận đây là "khung SIM"** (SIM frame/eSIM profile placeholder,
  không phải gói data thật) → **loại HẲN khỏi mọi tính toán** (thêm điều kiện `NOT (LENGTH(sku)=13 AND
  SUBSTRING(sku,8,1)='K')` ngay trong `period_records`, không còn bucket "Other" nữa — nhánh `K` trong
  `SKU_TYPE_CASE` cũng bỏ luôn vì không còn dòng nào lọt tới đó). Verify sống: tổng bundles kỳ T8/2026
  36.977 → 31.742 (giảm đúng 5.235, khớp số "SIM" gánh dưới mã K).
- **Chart "Mã SKU chiếm bao nhiêu SIM"** (per-SKU, quá chi tiết — 1366 mã riêng lẻ trong 1 kỳ) đổi thành
  **gom theo KÝ TỰ PHÂN LOẠI** — hàm `typeLetterOfSku()` mới: vị trí 8 cho SKU 13 ký tự, **vị trí 10** cho
  SKU CŨ 14 ký tự (Hiếu chỉ định 2 vị trí này, đã verify qua SQL: `SUBSTRING(sku,10,1)` trên mã 14 ký tự
  ra `P`/`F` — 2 giá trị phổ biến nhất, khớp đúng quy ước Daily/Fixed cũ). Độ dài khác (15/17/18 ký tự)
  chưa xác định vị trí → gộp "Khác (mã dài khác)". Đổi tên chart thành "Mã loại gói chiếm bao nhiêu SIM".
- **Breakdown "Unlimited — Breakdown theo gói"** đổi từ nhóm tốc độ/throttle (`500MB·5mbps`...) **sang
  trực tiếp mã ký tự** (mỗi dòng = 1 mã A/B/C/.../X, kèm mô tả gốc từ `CODE_LABELS` làm phụ chú) — đúng
  yêu cầu "mã A là bao nhiêu, mã B là bao nhiêu". Nhờ đổi cách gom nhóm, **bỏ hẳn** phụ thuộc
  `GET /api/analytics/3hk-speed-map` — route này (chỉ nhận diện mã `A`/`B` qua regex `/[AB]UNL/i`, đã lỗi
  thời từ khi C/D/E/G/H/L/X được phân loại đúng Unlimited ở s200+3) đã **XOÁ HẲN** (`route.ts` + state/
  fetch liên quan trong page.tsx). 2 chart phụ "So sánh mức sử dụng theo mã" + "Phân bố mức data sử
  dụng/ngày" giờ tự động phủ MỌI mã Unlimited, không riêng A/B như trước.
  tsc + lint (0 lỗi mới) + vitest (261/261) PASS.

### 3.2 Cấu trúc bản ghi (quan trọng để hiểu SUM)
- Mỗi bản ghi = 1 **snapshot theo ngày** của 1 SIM. `first_report_date` là mốc ngày (00:00:00 UTC).
- ~87% bundle chỉ có **1 bản ghi**; ~13% có 2–3 bản ghi (SIM báo cáo qua nhiều mốc cuối tháng).
- `total_data_gb` là **incremental** (usage của kỳ đó) → tab **SUM** các bản ghi trong kỳ ra tổng usage.

---

## 4. Cách đếm & Định nghĩa kỳ

### 4.1 Đơn vị = "Bundle"
- Bundle = mỗi cặp **`(iccid, order_code)`** duy nhất (= 1 SIM). "Active SIMs" = số bundle.

### 4.2 ⭐ Định nghĩa "SIM thuộc kỳ" (khớp NCC)
> **Một SIM/bundle được tính vào kỳ nếu CÓ bản ghi usage với `first_report_date` NẰM TRONG khoảng ngày chọn.** Usage & plan chỉ gom từ **các bản ghi trong kỳ**.

- Đây là cách **"SIM có usage trong kỳ"** — khớp với báo cáo NCC.
- **KHÔNG** phải "SIM phát sinh lần đầu trong kỳ" (bản cũ dùng `MIN(first_report_date)` = `bundle_start` → chỉ đếm SIM MỚI, ra thiếu ~5.000 SIM/tháng, lệch NCC).
- **KHÔNG** dùng `activation_date` (nếu đếm theo kích hoạt, tháng 6 chỉ ~26.854 SIM — cũng lệch NCC).

### 4.3 Kỳ mặc định khi mở tab
`đầu tháng(ngày data mới nhất) → ngày data mới nhất`, lấy từ `MAX(first_report_date)`. Data 3HK sync trễ (thường đến hết tháng trước) nên mặc định trỏ vào tháng mới nhất CÓ data.

### 4.4 ⚠️ GOTCHA timezone (đã từng gây lệch ~999 SIM)
`first_report_date` lưu **00:00:00 UTC**. Khi FE tính `endDate` từ `MAX(...)::date` **phải dùng `getUTC*`**, KHÔNG dùng giờ local — nếu không, trên trình duyệt lệch UTC (vd US) `getDate()` lùi 1 ngày → mất bản ghi ngày cuối kỳ (vd bản ghi `2026-06-30 00:00 UTC` bị bỏ → thiếu 999 SIM).
→ So sánh cận trên `first_report_date <= '2026-06-30'` (ngày cuối THÁNG) mới bao trọn; đừng dùng `'2026-06-29'`.

---

## 5. Câu query thật (tab sinh ra)

Cả 4 bảng dùng **chung 1 CTE** (`bundlesCTE`), khác nhau ở `SELECT` cuối. Ví dụ tab **"Tất cả"**, kỳ **tháng 6/2026**:

### CTE dùng chung
```sql
WITH period_records AS (
  SELECT iccid, order_code, sku, sku_type,
         total_data_gb, data_amount_gb, first_report_date, activation_date
  FROM fact_data_usage
  WHERE sku IN (SELECT sku FROM dim_sku
                WHERE REPLACE(UPPER(vendor),' ','') = '3HKDATAPOOL')   -- vendor lưu là '3HK DATAPOOL' (có dấu cách)
    AND first_report_date >= '2026-06-01'
    AND first_report_date <= '2026-06-30'                              -- ngày cuối THÁNG (mục 4.4)
),
bundles AS (
  SELECT iccid, order_code,
         MAX(sku) AS sku,
         CASE WHEN UPPER(MAX(sku)) LIKE '%UNL%' THEN 'Unlimited Data'
              ELSE MAX(sku_type) END           AS sku_type,
         MIN(first_report_date) AS first_report_date,
         MAX(activation_date)   AS activation_date,
         SUM(total_data_gb)     AS total_data_gb,   -- usage gom TRONG kỳ
         MAX(data_amount_gb)    AS data_amount_gb,  -- capacity/plan
         COUNT(*)               AS record_count
  FROM period_records
  GROUP BY iccid, order_code
)
```

### [1] Summary cards (Total Usage / Capacity / Avg % / Active SIMs)
```sql
-- <CTE>
SELECT SUM(total_data_gb)  AS total_usage,
       SUM(data_amount_gb) AS total_capacity,
       CASE WHEN SUM(data_amount_gb) > 0
            THEN (SUM(total_data_gb)/SUM(data_amount_gb))*100 ELSE 0 END AS avg_usage,
       COUNT(*) AS total_count          -- = Active SIMs
FROM bundles WHERE 1=1;
```

### [2] Average Usage by SKU Type
```sql
-- <CTE>
SELECT COALESCE(sku_type,'Unknown') AS sku_type,
       COUNT(*)            AS active_sims,
       SUM(data_amount_gb) AS total_plan_gb,
       SUM(total_data_gb)  AS total_usage_gb,
       CASE WHEN SUM(data_amount_gb) > 0
            THEN (SUM(total_data_gb)/SUM(data_amount_gb))*100 ELSE 0 END AS avg_usage_pct
FROM bundles WHERE 1=1
GROUP BY 1 ORDER BY total_usage_gb DESC;
```

### [3] Average Usage by SKU
```sql
-- <CTE>
SELECT sku, COUNT(*) AS active_sims,
       SUM(data_amount_gb) AS total_plan_gb,
       SUM(total_data_gb)  AS total_usage_gb,
       CASE WHEN SUM(data_amount_gb) > 0
            THEN (SUM(total_data_gb)/SUM(data_amount_gb))*100 ELSE 0 END AS avg_usage_pct
FROM bundles WHERE 1=1
GROUP BY 1 ORDER BY total_usage_gb DESC;
```

### [4] Bảng records (phân trang 50 dòng)
```sql
-- <CTE>
SELECT order_code, iccid, sku, sku_type,
       COALESCE(data_amount_gb,0) AS data_amount_gb,
       COALESCE(total_data_gb,0)  AS total_data_gb,
       CASE WHEN data_amount_gb > 0
            THEN (total_data_gb/data_amount_gb)*100 ELSE 0 END AS usage_pct,
       first_report_date, activation_date, record_count
FROM bundles WHERE 1=1
ORDER BY first_report_date DESC
LIMIT 50 OFFSET 0;      -- OFFSET = (trang-1)*50
```

### Phần động (khi KHÔNG phải tab "Tất cả")
- **Tab Daily/Fixed/Unlimited** → thêm vào mọi `WHERE 1=1`: `AND sku_type = 'Daily Data'` (hoặc `'Fixed Data'` / `'Unlimited Data'`).
- **Ô Search** → thêm: `AND (order_code ILIKE '%..%' OR iccid ILIKE '%..%' OR sku ILIKE '%..%')`.
- **Kỳ** → sửa 2 ngày trong `period_records`.

> File `test.sql` ở root repo có sẵn 4 query này để chạy thử trực tiếp trên DB (không commit).

---

## 6. Ý nghĩa các chỉ số hiển thị

| Chỉ số | Nghĩa |
|---|---|
| **Total Usage** | Tổng GB thực tế đã dùng trong kỳ (`SUM(total_data_gb)`) |
| **Total Capacity** | Tổng định mức plan (`SUM(data_amount_gb)`) |
| **Avg. Usage %** | `Total Usage / Total Capacity × 100` (xấp xỉ % Weighted của NCC) |
| **Active SIMs** | Số SIM có usage trong kỳ (= số bundle) |
| **Avg. GB/ngày/SIM** *(chỉ tab Unlimited)* | Thay cho "Avg Usage %" — vì gói unlimited không thể "dùng hết %" (thường >100%). = usage / (Σ active_sims × số ngày gói) |

> **Về cột %**: NCC báo cáo 2 cách — *Simple* (trung bình % của từng SIM) và *Weighted* (Σusage/Σplan). Cột % của tab ≈ **Weighted**. Số **SIM/ICCID** khớp NCC tuyệt đối; % có thể lệch nhẹ do phương pháp khác nhau.

---

## 7. Phân loại nhóm/mã gói Unlimited

> ⚠️ **s200+4 (2026-09-17) — đổi hẳn cơ chế**, không còn nhóm theo tốc độ (high-speed × throttle) nữa.

Tab **Unlimited** có bảng "Unlimited — Breakdown theo mã" + 2 biểu đồ. Nhóm được tính **CLIENT-side**
trong `page.tsx` bằng `typeLetterOfSku()` — đọc thẳng ký tự phân loại tại vị trí 8 (SKU 13 ký tự) hoặc vị
trí 10 (SKU 14 ký tự cũ), KHÔNG còn gọi API riêng, KHÔNG còn phụ thuộc `skus.throttle_speed` (Supabase).
Mỗi mã (A/B/C/D/E/G/H/L/X, và bất kỳ ký tự nào khác gặp trong dữ liệu thật) là 1 dòng riêng trong bảng,
kèm mô tả gốc từ `CODE_LABELS` (xem bảng mapping ở §3.1) làm phụ chú. GB/ngày/SIM so plan/actual dùng
`daysOfSku()` (đọc DayAmount ở cuối SKU, xem §3.1) — không đổi công thức, chỉ đổi khoá gom nhóm.

<details><summary>Lịch sử trước s200+4 (đã bỏ — giữ tham khảo)</summary>

Trước đây nhóm được tính SERVER-side ở route `GET /api/analytics/3hk-speed-map` (đã XOÁ), gộp theo
tốc độ throttle thay vì theo mã, tối đa 3 nhóm cố định: `500MB·5mbps`, `500MB·10mbps`, `1GB·10mbps`.
Mã CŨ (`ECHN3DP1UNLI05D`...) phân loại theo P-code (P2→5mbps, P1→10mbps, PY→1GB·10mbps); mã MỚI
(`EACHN3DBUNL05`...) ưu tiên đọc `skus.throttle_speed` (Supabase), fallback theo chữ A→5mbps/B→10mbps.
Nhược điểm phát hiện dẫn tới đổi cơ chế: chỉ nhận diện được mã A/B, không có bucket cho C(20mbps)/
D(100mbps)/L(50mbps)/E/G/H/X — các mã này bị loại khỏi 2 chart phụ dù đã đúng ở bảng chính.

</details>

---

## 8. Đối chiếu báo cáo NCC

Kỳ **tháng 6/2026** — số **ICCID** khớp tuyệt đối:

| Loại | NCC | Tab |
|---|---|---|
| Fixed Data | 15.091 | **15.091** ✅ |
| Daily Data | 19.399 | **19.399** ✅ |
| Unlimited Data | 3.171 | **3.171** ✅ |
| **Tổng** | **37.661** | **37.661** ✅ |

**Cách tự verify nhanh** (chạy trên `gohub_dw`):
```sql
SELECT COUNT(DISTINCT iccid)
FROM fact_data_usage
WHERE sku IN (SELECT sku FROM dim_sku WHERE REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL')
  AND first_report_date >= '2026-06-01' AND first_report_date <= '2026-06-30';   -- = 37661
```

---

## 9. Gotchas & Lịch sử thay đổi

- **s203+ (2026-09-21) — Export bảng "Average Usage by SKU" theo tháng.** Hiếu: export nhiều tháng cần cột
  tháng để phân biệt + thống kê. Nút **"Export theo tháng"** (header bảng SKU, `exportMonthly`) xuất 1 sheet
  cột y hệt bảng UI: `Tháng · SKU · Active SIMs · Total Plan (GB) · Kế hoạch (GB/ngày/SIM) · Total Actual (GB) · Avg. Usage % · GB/ngày/SIM`, mỗi dòng
  = 1 SKU trong 1 tháng (YYYY-MM) của kỳ đang lọc, theo tab Daily/Fixed/Unlimited + ô Search. Không có dòng
  "Cả kỳ" (tránh cộng đôi khi pivot). GB/ngày/SIM = usage ÷ SIMs ÷ số ngày gói (`daysOfSku`), để trống nếu
  không xác định được số ngày. (Bản trước làm nhiều sheet + thừa cột → Hiếu yêu cầu đúng cột bảng SKU, đã bỏ.)
  Nút Export của bảng Records vẫn riêng (thêm cột `Tháng`/`Kỳ từ`/`Kỳ đến`). ⚠️ (iccid, order_code) tính
  riêng TỪNG tháng có usage → tổng Active SIMs các tháng của 1 SKU có thể LỚN HƠN số ở bảng UI (1 SIM = 1 lần
  cả kỳ) — đúng thiết kế, không phải bug.

- **s200+10 (2026-09-18) — Đổi bảng theo nước sang bảng Zone có drill-down, bỏ hẳn bảng theo nước.**
  Tiếp ngay s200+9 (lúc đó vẫn giữ song song 2 bảng theo nước + theo zone) — Hiếu yêu cầu: bảng Zone phải
  cho biết được "zone nào có nước nào" (bấm 1 zone → xổ breakdown các nước), sau đó BỎ HẲN bảng theo nước
  riêng vì không còn cần thiết. Đã thêm `zoneMembers` (Record zone→danh sách nước, sort TB giảm dần) +
  state `expandedZone` — bấm cả hàng Zone (không chỉ icon) toggle 1 bảng con thu nhỏ/thụt lề ngay dưới.
  Đã xoá hẳn bảng "Data Usage by Country × Month" (JSX card riêng) + dọn code chết đi kèm
  (`countryGrand` state/`setCountryGrand`, `exportCountryCsv` — không còn nơi nào gọi). `exportZoneCsv`
  đổi để xuất đủ 2 cấp (mỗi Zone kèm danh sách nước con, prefix `"  · "`) — mở Excel vẫn thấy đủ mapping.
  Xem chi tiết đầy đủ (query, verify số liệu, layout) ở mục 6 (đã viết lại toàn bộ, gộp luôn nội dung mục
  6b cũ). tsc + lint (0 lỗi mới — 2 warning `error`/`hasMore` tại dòng 176/182 là code CŨ có từ trước cả
  s200+9, không liên quan đợt sửa này) + vitest (261/261) PASS. Đã push staging, chưa merge main.

- **s200+9 (2026-09-18) — 3 việc theo yêu cầu Hiếu: fix regression bảng Country×Month, thêm bảng Zone,
  fix trùng mã P cũ/mới.** Tất cả đã verify trực tiếp SQL/API trên staging trước khi code (không đoán).
  1. **Bảng "Data Usage by Country × Month" chỉ hiện 1 tháng** — regression thật, không rõ từ session
     nào: effect fetch bảng này bị đổi sang dùng CHUNG `startDate`/`endDate` với bộ lọc SKU chính thay vì
     tự tính cửa sổ rộng độc lập như thiết kế gốc s95. Fix trả lại đúng thiết kế gốc (cửa sổ tự tính từ
     `MAX(report_date)`, không phụ thuộc filter nào) — bảng này sau đó bị BỎ HẲN ở s200+10, xem mục 6.
  2. **Bảng mới "Data Usage by Zone × Month"** — nhóm 47 nước trong Supabase `ncc_3hk` thành 4 Zone
     (A=A1+A2 gộp, B, C, D) qua route có sẵn `GET /api/ncc/3hk-zones`, tính lại từ `countryRows` đã fetch
     (không thêm query gohub_dw). 4 dòng Zone + dòng "Chưa rõ Zone" (nước thiếu trong `ncc_3hk`, hiện tại
     chỉ "Latvia", 0,01 TB) + dòng cuối "Tổng 4 Zone". Đợt này CHƯA có drill-down (thêm ở s200+10) — xem
     mục 6.
  3. **Fix trùng mã P giữa mã SKU CŨ (14kt) và MỚI (13kt)** — verify SQL xác nhận P-mới=Daily thật
     (0% "UNL"), P-cũ=Unlimited thật (100% "UNL") — 2 nghĩa hoàn toàn khác nhau bị gộp chung 1 bucket ở
     tầng hiển thị (KHÔNG ảnh hưởng phân loại Daily/Fixed/Unlimited chính, vẫn đúng từ trước). Fix thêm
     `skuVintage()`, mọi nơi gom theo ký tự giờ tách rõ badge "mã mới · 13kt"/"mã cũ · 14kt". Xem mục 7.

  tsc + lint (0 lỗi mới) + vitest (261/261) PASS cả 3 việc.

- **s200+4 (2026-09-17) — Loại hẳn SKU "khung SIM" + đổi chart/breakdown Unlimited sang mã ký tự.** Tiếp
  ngay s200+3 cùng ngày, Hiếu phản hồi 3 điểm:
  1. **SKU `1D0003DK00000` (mã `K`) xác nhận là "khung SIM"** — không phải gói data thật → **loại HẲN**
     khỏi mọi tính toán (`WHERE NOT (LENGTH(sku)=13 AND SUBSTRING(sku,8,1)='K')` trong `period_records`),
     KHÔNG còn tách bucket "Other" như đợt s200+3 (bucket "Other" đã bị xoá khỏi `SKU_TYPE_CASE`). Verify
     sống: tổng bundles 36.977 → 31.742 (giảm đúng 5.235, khớp số SKU K).
  2. **Đổi chart "Mã SKU chiếm bao nhiêu SIM"** (per-SKU, quá chi tiết với 1366 mã riêng lẻ) **sang gom
     theo KÝ TỰ PHÂN LOẠI** — `typeLetterOfSku()` mới: vị trí 8 cho SKU chuẩn 13 ký tự, **vị trí 10** cho
     SKU CŨ 14 ký tự (Hiếu chỉ định chính xác, verify qua SQL: `SUBSTRING(sku,10,1)` trên mã 14 ký tự ra
     `P`/`F` hợp lý — khớp quy ước Daily/Fixed cũ). Độ dài khác (15/17/18 ký tự) chưa xác định được vị trí
     → gộp "Khác (mã dài khác)". Chart đổi tên thành "Mã loại gói chiếm bao nhiêu SIM".
  3. **Breakdown "Unlimited — Breakdown theo gói"** đổi từ nhóm tốc độ/throttle (`500MB·5mbps`...) **sang
     trực tiếp mã ký tự** (A/B/C/.../X, kèm mô tả gốc làm phụ chú qua `CODE_LABELS`) — đúng yêu cầu "mã A
     là bao nhiêu, mã B là bao nhiêu". Nhờ đó **bỏ hẳn phụ thuộc `GET /api/analytics/3hk-speed-map`**
     (route đã XOÁ — chỉ nhận diện mã A/B qua regex `/[AB]UNL/i`, lỗi thời sau khi C/D/E/G/H/L/X được
     phân loại đúng Unlimited ở s200+3) — 2 chart phụ "So sánh mức sử dụng theo mã" + "Phân bố mức data/
     ngày" giờ tự động phủ MỌI mã Unlimited, không riêng A/B như trước.
  tsc + lint (0 lỗi mới) + vitest (261/261) PASS. Đã tự verify sống trên staging TRƯỚC khi code (chạy
  đúng câu SQL mới qua Dev Tools) — số liệu khớp tuyệt đối.
- **s200+3 (2026-09-17) — Fix phân loại Daily/Fixed/Unlimited sai + chart mới "Mã SKU chiếm bao nhiêu
  SIM".** Xem chi tiết đầy đủ ở §3.1 (bảng mapping ký tự vị trí 8, SQL trước/sau, 2 phát hiện thêm chưa
  sửa). Tóm tắt: mã `X` (và `C`/`D`/`E`/`G`/`H`/`L`) là Unlimited nhưng bị xếp Daily/Fixed do code cũ chỉ
  nhận diện Unlimited qua substring `%UNL%` — không có trong các mã này. Đổi sang CASE theo ký tự vị trí 8
  của SKU 13 ký tự (bảng mapping đầy đủ ở §3.1). Verify sống: Fixed -5235 SIM = Other +5235 (đúng số SKU
  `K`, mã placeholder eSIM profile/SIM frame giờ tách riêng thay vì gộp nhầm Fixed), Daily -26 =
  Unlimited +26 (đúng số SKU `X`) — khớp tuyệt đối. Kèm fix `daysOfSku()` (cột "GB/ngày/SIM" tab
  Unlimited) thêm fallback đọc 2 ký tự cuối SKU 13 ký tự khi không có literal "UNL"/"...D" — trước luôn
  "—" cho C/D/E/G/H/L/X. Thêm chart mới `SkuCountChart` (`3hk-usage-charts.tsx`) — bar ngang top 15 SKU
  theo Active SIMs + gộp "Khác", dùng lại `skuMetrics` đã fetch sẵn, không thêm query. tsc + lint (0 lỗi
  mới) + vitest (261/261) PASS.
- **s200+2 (2026-09-17) — pipeline nạp theo ĐỢT lớn không đều kỳ, KHÔNG phải hàng ngày (giải thích cơ chế
  đầy đủ, sau khi Hiếu hỏi lại về tháng 9).** Verify trực tiếp qua Dev Tools SQL Query: pipeline đã tự
  chạy lại — `fact_data_usage` giờ có data tới **2026-08-31**, `loaded_at` mới nhất = **2026-09-17** (hôm
  chạy audit này). Đào sâu bằng `GROUP BY loaded_at::date` phát hiện quy luật thật: nạp theo **3 đợt lớn
  rời rạc**, mỗi đợt gồm ~2-3 tháng dữ liệu cùng lúc — **15/07** nạp T1-T3/2026, **20/07** nạp T4-T6/2026,
  **17/09** nạp T7-T8/2026 (khoảng cách giữa đợt 2 và 3 là ~2 tháng). Đây là bằng chứng RÕ RÀNG pipeline
  vận hành theo kiểu **batch/manual định kỳ vài tháng**, không phải ETL tự động hàng ngày/hàng giờ như
  các bảng `fact_fulfillment_revenue`/`fact_sales_revenue` khác — nên **tháng đang chạy (vd T9 lúc viết
  bài này) sẽ LUÔN "thiếu" cho tới đợt nạp kế tiếp**, đây là đặc tính bình thường của nguồn ngoài repo,
  không phải lỗi cần sửa mỗi lần. Fix duy nhất khả thi ở phía web: thêm **badge freshness** ngay dưới
  tiêu đề trang (`3hk-usage/page.tsx`, state `maxAvailableDate` — tách riêng khỏi `endDate` để không đổi
  theo bộ lọc người dùng đang chỉnh) hiện rõ "Dữ liệu 3HK mới nhất: dd/mm/yyyy — cập nhật theo đợt, không
  phải hàng ngày... KHÔNG phải bug web", đổi màu cảnh báo (amber) khi đã cũ >45 ngày — mục tiêu để người
  xem (và cả Hiếu lần sau) tự hiểu ngay, tránh lặp lại chu kỳ hỏi→audit→"không phải bug" đã xảy ra 2 lần
  trong cùng 1 tháng cho cùng 1 tab.
- **🔴 s199 (2026-09-16) — dữ liệu đứng yên từ tháng 7, KHÔNG phải bug web** (Hiếu báo thiếu tháng 8):
  verify trực tiếp SQL trên staging — `fact_data_usage` MAX = **2026-06-30** (`loaded_at` ETL MAX =
  **2026-07-20**, đứng yên từ đó); `data_usage_log` (sub-report Country×Month) MAX = **2026-07-31**.
  Tra registry ETL thật (`jobs`/`job_logs`, gohub_dw) — 8 job đang active (dim/vatdb_cogs/fulfillment/
  sales/ops_sync×2/recon_telco/inventory) nhưng **KHÔNG job nào ghi 2 bảng này**. Pipeline nạp usage 3HK
  nằm NGOÀI phạm vi repo `gohub-intel` (không phải cron `sync.yml` GitHub Actions của web, không có
  script nào trong `backend/`/`web/` từng ghi 2 bảng — grep xác nhận 0 kết quả). Không có gì để sửa ở
  code web — cần Hiếu hỏi bên vận hành/vendor 3HK pipeline đó còn chạy không. **Cập nhật s200+2**: pipeline
  đã tự chạy lại (xem mục trên) — kết luận "ngoài phạm vi repo" vẫn đúng, chỉ bổ sung thêm bằng chứng về
  quy luật nạp theo đợt.
- **s196+21 (2026-09-14) — gộp toLocaleString() trần → formatNumber()**: 6 chỗ, cùng lý do lệch locale
  mặc định trình duyệt nêu ở wiki Channels. Đề xuất C (P2) roadmap performance audit s196+20.
- **s196+21 (2026-09-14) — code-split recharts**: 2 chart ("So sánh mức sử dụng theo nhóm",
  "Phân bố mức data sử dụng/ngày") tách sang `3hk-usage-charts.tsx` (`React.memo` +
  `next/dynamic({ssr:false})`, cùng pattern `bod-charts.tsx`) — trước import `recharts` trực tiếp ở
  `page.tsx` (1271 dòng). Phát hiện qua audit performance toàn hệ thống. Không đổi số liệu/UI.
- **s194+11 (2026-09-06)**: UI — `blue-*`→`brand-*` toàn trang, 2 chart CartesianGrid→`CHART_GRID_COLOR`.
  Giữ nguyên màu semantic thật (đỏ=vượt mức 3HK cấp/ngày, xanh lá=trong kế hoạch, xám=mức kế hoạch, dải màu
  categorical cho nhóm tốc độ) — không phải màu ngẫu hứng cần dọn. Không đổi logic/data.
- **Vendor có dấu cách**: trong `dim_sku` vendor = `'3HK DATAPOOL'` → luôn lọc `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'`.
- **Timezone (mục 4.4)**: `first_report_date` = 00:00:00 UTC; format kỳ bằng `getUTC*`.
- **`fact_data_usage` là 3HK-only**: gần như toàn bộ là 3HK (chỉ ~68 iccid có `sku` null bị loại) → dùng vendor-filter là đủ, không sợ lẫn vendor khác.
- **Session 90–93**:
  - s90: speed-map xử lý cả mã cũ (P1/P2/PY) + mã mới (A/B UNL); che cột nhạy cảm.
  - s93: đổi định nghĩa kỳ sang "SIM có usage trong kỳ" (khớp NCC) + gộp 4 query về 1 `bundlesCTE`; backfill 55 `throttle_speed`; "Avg Usage %" → GB/ngày/SIM cho Unlimited; xoá route chết; fix UTC.

---

## 6. Sub-report: Data Usage by Zone × Month (TB) — thêm s95 (theo nước), đổi hẳn sang Zone s200+9/+10

> ⚠️ **s200+10 (2026-09-18) — Đổi từ bảng "theo nước" sang "theo Zone có drill-down", THEO YÊU CẦU HIẾU
> (không phải bug).** Hiếu: bảng theo nước cũ (s95, 47 dòng, dài khó nhìn) đổi sang gom theo Zone
> (Supabase `ncc_3hk`) làm dòng CHÍNH, nhưng vẫn phải biết "zone nào có nước nào" — bấm 1 dòng Zone xổ ra
> breakdown các nước thuộc zone đó, ngay trong cùng 1 bảng (không cần bảng riêng theo nước nữa). Sau khi
> làm xong, **bảng "Data Usage by Country × Month" cũ (mục 6 cũ) đã BỎ HẲN** — không còn hiển thị độc lập,
> dữ liệu theo nước giờ chỉ xem qua drill-down trong bảng Zone. Đây là thay đổi kế tiếp ngay sau s200+9
> (lúc đó vẫn giữ CẢ 2 bảng song song) — xem lịch sử fix regression + xây zone lần đầu ở mục 9, s200+9.
> `countryRows`/`countryMonths` (state fetch) vẫn giữ nguyên logic/query y hệt s200+9 — chỉ không còn
> render riêng, dùng làm nguồn cho `zoneMembers`/`zoneRows` bên dưới.

Bảng nhóm theo Zone (Supabase `ncc_3hk`, Zone A = gộp `A1`+`A2` theo yêu cầu Hiếu, B/C/D giữ nguyên — đã
là 1 mã/zone trong `ncc_3hk`). Verify trực tiếp qua `GET /api/ncc/3hk-zones` (route có sẵn cho NCC
Catalog, mở cho mọi role đã login — không tạo route mới): 47 dòng, đúng 4 zone gốc (A1=5 nước, A2=27
nước, B=7 nước, C=6 nước, D=2 nước = 47). **Độc lập** với kỳ/tab của bảng SKU chính (mount effect riêng,
chạy 1 lần — KHÔNG phụ thuộc nút "Lọc"/ngày ở đầu trang).

- **Nguồn nước** (`countryRows`, nội bộ không render riêng): `data_usage_log` (log thô từng ngày — cột
  `report_date`, `country`, `data_gb`). KHÔNG dùng `fact_data_usage` (bảng đó không có `country`). Đơn vị
  TB = `SUM(data_gb) / 1024`. Cửa sổ tự tính `MAX(report_date) − INTERVAL '23 months'` (đủ phủ toàn bộ
  lịch sử thật hiện có từ 2026-01), KHÔNG lọc `report_date::date BETWEEN startDate AND endDate` như bug
  regression s200+9 đã fix — xem query đầy đủ + số liệu verify ở mục 9 (s200+9).
- **KHÔNG query gohub_dw thêm lần nào cho Zone** — `zoneMembers`/`zoneRows`/`zoneGrand` tính CLIENT-SIDE
  từ `countryRows` đã fetch, group theo zone tra được từ `ncc_3hk.country`.
- **Alias tên nước** (`COUNTRY_ALIAS` trong `page.tsx`) — verify đối chiếu 46 nước distinct trong
  `data_usage_log` với 47 nước trong `ncc_3hk`: `"USA"` (data_usage_log) ≠ `"US"` (ncc_3hk), `"United
  Kingdom"` ≠ `"UK"`, `"Slovak Republic"` ≠ `"Slovakia"` — 3 cặp tên khác spelling y hệt 1 nước, tổng
  ~6,7 TB (~0,5% toàn kỳ) sẽ rơi nhầm "Chưa rõ Zone" nếu không map. Đã thêm alias map, verify lại khớp.
- **`"Latvia"`** xuất hiện trong `data_usage_log` (0,01 TB, không đáng kể) nhưng **KHÔNG có trong
  `ncc_3hk`** — thiếu hẳn (không phải lỗi đặt tên) → rơi đúng vào dòng "Chưa rõ Zone" (hiện riêng, KHÔNG
  âm thầm bỏ qua — nếu sau này 1 nước MỚI phát sinh usage lớn mà chưa có trong `ncc_3hk`, dòng này sẽ phồng
  lên rõ ràng thay vì lặng lẽ mất số liệu).
- **Layout**: 4 dòng Zone A/B/C/D (thứ tự cố định, không sort theo TB) + dòng "Chưa rõ Zone" nếu có +
  dòng cuối **"Tổng 4 Zone"** (verify sống: khớp TUYỆT ĐỐI GRAND TOTAL bảng theo nước cũ — 1.237,60 TB
  toàn kỳ 8 tháng — vì cùng 1 nguồn, cách kiểm tra nhanh nếu nghi mapping sai). Mỗi dòng Zone có state
  `expandedZone` — bấm (cả hàng, không chỉ icon) → xổ 1 bảng con NGAY DƯỚI, liệt kê từng nước thuộc zone
  đó (từ `zoneMembers[zone]`, sort theo TB giảm dần), cùng cột tháng/Total/Run-rate, style thu nhỏ + thụt
  lề (`pl-9`) để phân biệt cấp con. Đóng lại bằng bấm lại chính hàng Zone đó.
- **Export** (`exportZoneCsv`) — GIỮ đủ cả 2 cấp trong 1 file: mỗi dòng Zone theo sau bởi các dòng nước
  thuộc zone đó (prefix `"  · "` phân biệt cấp con), rồi tới dòng "TỔNG 4 ZONE" cuối cùng — mở Excel vẫn
  biết đủ "zone nào có nước nào" mà không cần vào lại web.
- **Đối chiếu** (T6/2026, đã re-verify s200+10): GRAND TOTAL/TỔNG 4 ZONE = **186,80 TB** — khớp DB thật
  từ s95, không đổi qua các đợt sửa.
- **File**: `web/src/app/(dashboard)/analytics/3hk-usage/page.tsx` — state `countryMonths/countryRows`
  (fetch), `zoneByCountry` (fetch `ncc_3hk`), `zoneMembers`/`zoneRows`/`zoneGrand` (useMemo), `expandedZone`
  (state UI), `zoneLabel()`, `exportZoneCsv`. `fmtTB`, `monthLabel` dùng chung.

---

## 7. Tab "Unlimited" — Breakdown theo gói (audit cột + góc nhìn doanh nghiệp, s95)

**Nguồn dữ liệu (fact_data_usage, gom qua `bundlesCTE` → `fetchSKUMetrics`)** — mỗi SKU:
- `active_sims` = `COUNT(*)` bundle (iccid+order_code có usage trong kỳ).
- `total_plan_gb` = `SUM(data_amount_gb)`. **Với gói Unlimited, `data_amount_gb` KHÔNG phải 9999** mà = **mức 3HK cấp/ngày × số ngày** (đã đối chiếu DB: **A = 1.8 GB/ngày, B = 1.6 GB/ngày**; mã cũ IP1/PY→1.8, IP2→1.6). Đây là "hạn mức mềm" (fair-use), không phải cap cứng.
- `total_usage_gb` = `SUM(total_data_gb)` — data thực dùng (cả phần đã throttle vẫn tính chi phí datapool).
- `avg_usage_pct` = `total_usage_gb / total_plan_gb × 100`.
- Số ngày gói: `daysOfSku(sku)` (mã mới `…UNL05`→5; mã cũ `…05D`, bỏ token P1/P2 trước).

> ⚠️ **s200+9 (2026-09-18) — Fix trùng mã P giữa mã CŨ và mã MỚI (Hiếu báo).** Verify trực tiếp SQL trên
> staging (`fact_data_usage`, vendor `3HKDATAPOOL`) trước khi sửa: ký tự `P` ở mã **MỚI 13kt** (vị trí 8)
> — 792 SKU distinct, **0/792 (0%)** có chuỗi "UNL" → đúng là **Daily throttle <2mbps** (khớp
> `CODE_LABELS`). Ký tự `P` ở mã **CŨ 14kt** (vị trí 10) — 350 SKU distinct, **350/350 (100%)** có chuỗi
> "UNL" (nằm trong token `"UNLIP1"`/`"UNLIP2"`) → **THỰC CHẤT LÀ UNLIMITED**, không liên quan gì "Daily".
> `typeLetterOfSku()` trước gộp cả 2 vintage vào chung 1 bucket "P" khi tính chart "Mã loại gói chiếm bao
> nhiêu SIM" (tab "Tất cả", nơi cả 2 loại cùng xuất hiện) — nhãn `CODE_LABELS["P"]="Daily throttle
> <2mbps"` áp NHẦM cho cả 350 SKU Unlimited-cũ. **Lưu ý: bucket phân loại chính (Daily/Fixed/Unlimited,
> `SKU_TYPE_CASE` §3.1) KHÔNG bị ảnh hưởng** — nhánh `UPPER(sku) LIKE '%UNL%'` cho mã 14kt đã tự động xếp
> đúng 350 SKU này vào Unlimited từ trước; bug chỉ nằm ở tầng HIỂN THỊ/GOM NHÓM theo ký tự đơn lẻ. Fix:
> `skuVintage(sku)` mới (13/14 ký tự) — mọi nơi gom theo `typeLetterOfSku()` giờ khoá kèm vintage
> (`${letter}_${vintage}`), hiển thị badge rõ "mã mới · 13kt" (xanh lá) / "mã cũ · 14kt" (vàng); `F`/`O` ở
> mã cũ (184 và 1 SKU) cũng tách riêng dù CHƯA xác định được ý nghĩa thật (không tự gán `CODE_LABELS` cho
> vintage cũ — chỉ verify chắc chắn được `P`=Unlimited). tsc + lint (0 lỗi mới) + vitest (261/261) PASS.

### 3.1d Tách sub-variant Unlimited cùng ký tự (s202)

> ⚠️ **Hiếu báo**: cùng ký tự phân loại (VD `B`) có thể gộp CHUNG nhiều gói THẬT khác nhau — VD "500MB tốc
> độ cao rồi giảm còn 10Mbps" và "1GB tốc độ cao rồi giảm còn 10Mbps" đều là mã `B` (cùng nghĩa gốc "Daily
> - Unlimited 10mbps" trong `CODE_LABELS`), chỉ nhìn SKU letter KHÔNG phân biệt được — trước s202 hai gói
> này bị gộp nhầm chung 1 dòng "B" trong bảng breakdown, làm sai lệch cả "GB/ngày/SIM" (trộn 2 mức tiêu
> dùng thật khác nhau vào 1 trung bình) lẫn "Kế hoạch" (trộn 2 định mức khác nhau).

**Nguồn dữ liệu mới**: đợt sync s202 (đọc trực tiếp response `GET /skus` thật của GoHub API, xem
`docs/session_summary.txt`) thêm 2 cột vào Supabase `skus`: `data` (ngưỡng data tốc độ cao trước khi giảm
tốc, đơn vị MB — VD `500`/`1024`) và `speed` (tốc độ Mbps SAU khi hết ngưỡng — VD `10`). Đây là 2 cột SỐ,
lấy thẳng từ vendor, đáng tin hơn hẳn việc tự suy đoán qua regex trên `throttle_speed` (cách route cũ
`/api/analytics/3hk-speed-map` từng làm, chỉ nhận diện được A/B, đã xoá ở s200+4).

**Vấn đề cross-DB**: `fact_data_usage.sku` nằm ở `gohub_dw` (GCP Postgres), còn `skus.data`/`skus.speed`
nằm ở Supabase — 2 database TÁCH BIỆT, không JOIN được bằng 1 câu SQL. Giải pháp: FE tự fetch 2 nguồn rồi
merge ở client — `skuMetrics` (từ `/api/analytics/query`, gohub_dw) giữ nguyên; thêm 1 `useEffect` (chỉ
chạy khi `activeTab==="Unlimited"`) POST danh sách sku_code distinct đang hiển thị sang route mới
`/api/analytics/3hk-sku-meta` (Supabase, chunk 150 sku/lần — khớp tiền lệ Product Catalogue s198), lưu vào
state `skuMeta: Record<sku_code, {data, speed, throttle_speed}>`.

**Khoá gộp nhóm đổi** từ `${letter}_${vintage}` sang `variantKeyOf()` = `${letter}_${vintage}_${data}_
${speed}` (hàm `variantKeyOf()`, `page.tsx`) — cùng ký tự nhưng khác `data`/`speed` giờ tách thành 2 dòng
riêng trong bảng breakdown, mỗi dòng có "Active SIMs"/"GB ngày/SIM"/"Kế hoạch" tính riêng, không còn trộn.
SKU không tra được meta (VD sản phẩm đã ngừng bán, mất khỏi `skus` hiện tại) tự lùi về gộp theo `${letter}
_${vintage}_x_x` như hành vi CŨ (không vỡ nhóm), kèm badge "chưa rõ gói cụ thể" trên UI.

**Nhãn hiển thị** (`variantLabelOf()`) ưu tiên dùng thẳng `skus.throttle_speed` — chuỗi người-đọc-được lấy
nguyên văn từ GoHub API (VD `"1GB high speed then drop to 10 mbps"`), tự nhiên và chính xác hơn hẳn tự
ghép câu. Không có `throttle_speed` nhưng có `data`+`speed` thì tự ghép: `"{data ra GB/MB} tốc độ cao,
giảm còn {speed}Mbps"`. Không có gì cả (SKU không tra được) thì lùi về `CODE_LABELS[letter]` cũ.

**Chart** (`sgChartName()`) dùng nhãn NGẮN hơn bảng (trục X không đủ chỗ cho câu mô tả đầy đủ) — dạng
`B·500MB`/`B·1GB`, kèm hậu tố "(cũ)" nếu vintage 14 ký tự.

Test: chưa có unit test riêng (hàm thuần nằm trong `page.tsx`, không export) — verify bằng tsc + lint (0
lỗi mới) + vitest (368/368) PASS + tự xem qua UI (đọc bảng breakdown sau khi Supabase trả `skuMeta`).

> ⚠️ **2 bug phát hiện khi tự QA sống trên staging ngay sau khi làm §3.1d — đã fix cùng đợt:**
> 1. **Race condition** — bấm tab "Unlimited" thì React re-render NGAY với `activeTab`="Unlimited" nhưng
>    `skuMetrics` vẫn còn dữ liệu tab CŨ (VD "Tất cả", lẫn cả Fixed/Daily) cho tới khi fetch mới xong (async)
>    — `speedGroups` không tự biết `skuMetrics` có "đúng hạn" hay không (chỉ nhìn `activeTab`), nên có lúc
>    hiện SAI hẳn (VD mã `F`/Fixed lẫn vào bảng Unlimited với số SIM rất lớn). Verify qua SQL trực tiếp
>    (Dev Tools) xác nhận backend/API hoàn toàn đúng — bug thuần FE, có sẵn từ trước (không phải do
>    sub-variant fix gây ra), chỉ tình cờ bị soi kỹ hơn lúc QA đợt này.
>    - **Fix lần 1 (KHÔNG đủ)**: thêm state `skuMetricsTab` (gắn sau `setSkuMetrics`, chụp tab lúc gọi),
>      `speedGroups` chỉ tính khi `activeTab === skuMetricsTab`. Verify sống lại phát hiện VẪN kẹt — nguyên
>      nhân sâu hơn: response CŨ có thể trả VỀ SAU response MỚI (network timing không đảm bảo thứ tự), nên
>      request cũ tới sau ĐÈ `skuMetricsTab` về sai sau khi request mới đã set đúng — bảng kẹt "Không có
>      dữ liệu" vĩnh viễn thay vì tự hồi phục.
>    - **Fix lần 2 (đúng)**: `skuMetricsReqIdRef` (`useRef`, tăng mỗi lần `fetchSKUMetrics()` gọi) — chỉ
>      set state khi response về mà `reqId` vẫn là request MỚI NHẤT, bỏ hẳn mọi response cũ đến muộn bất kể
>      thứ tự network. Verify sống tiếp phát hiện card "Average Usage by SKU Type" (`fetchSKUTypeMetrics`)
>      bị CÙNG BUG, độc lập với bảng breakdown (2 widget cùng trang hiện lệch tab nhau) — áp cùng pattern
>      `reqId` cho cả `fetchSKUTypeMetrics`/`fetchTotals`/`fetchRecords` (4 fetch tab-phụ-thuộc, mỗi cái 1
>      `useRef` riêng vì đều gọi độc lập được từ nhiều nơi — nút Lọc/Refresh/debounce search/phân trang).
> 2. **Tổng bảng thấp hơn KPI card** — SKU độ dài khác 13/14 ký tự (15/17/18kt, `typeLetterOfSku()`/
>    `skuVintage()` trả null) bị `continue` bỏ qua ÂM THẦM ở `speedGroups`/`speedGroupMembers`, làm tổng
>    "Active SIMs" thấp hơn "Average Usage by SKU Type" card ~6 SIM/2839 (kỳ 08/2026) — pre-existing từ
>    s200+4 (đã có tiền lệ y hệt ở `typeLetterChart`, chart phía trên, bucket "Khác (mã dài khác)" — riêng
>    bảng breakdown này trước chưa làm). Fix: `otherLengthGroup` — 1 dòng "Mã dài khác" cuối bảng, tổng
>    active_sims/plan/usage của các SKU này, có nút "Chi tiết" bung xem từng SKU. Giờ tổng bảng luôn khớp
>    tuyệt đối KPI card.
>
> Đã verify sống trên staging sau fix cuối (reqId): thử cả bấm 1 lần chờ lâu lẫn bấm dồn dập nhiều tab
> liên tiếp (Fixed→Unlimited, Fixed→Unlimited→Fixed→Unlimited) — luôn tự settle đúng về tab đang chọn,
> không còn kẹt rỗng, không còn nháy sai, mọi widget trên trang (KPI card/SKU Type/breakdown) luôn đồng bộ
> cùng 1 tab. tsc + lint (0 lỗi mới) + vitest (368/368) PASS.
>
> **Fix thêm cùng đợt (Hiếu báo)**: cột GB/ngày/SIM và Thực tế/Kế hoạch % dùng `.toFixed()` trần (kiểu Mỹ,
> dấu chấm thập phân "1.92") trong khi Active SIMs/Total Plan/Total Actual cùng bảng dùng `formatNumber()`
> (vi-VN, dấu phẩy thập phân "24.253,2") — không đồng nhất trong CÙNG 1 bảng. Thêm helper `fmtDec(n,
> decimals)` (vi-VN, số chữ số thập phân cố định) thay mọi `.toFixed()` ở chỗ HIỂN THỊ trong trang (bảng
> breakdown, SKU Type, Average Usage by SKU, Records, tooltip chart) — CHỪA nguyên `.toFixed()` ở phần
> export Excel/CSV (cần Number thuần, không phải chuỗi định dạng).

### 3.1e Giải mã sub-variant cho mã CŨ 14kt/15kt (s202+2)

3 vintage SKU, cấu trúc HOÀN TOÀN KHÁC NHAU (Hiếu cung cấp, verify 100% qua SQL thật trên
`fact_data_usage` 2026-09-22 trước khi code — xem `docs/session_summary.txt`):

- **Mã MỚI (13kt)**: ký tự phân loại vị trí 8 (không đổi, xem §3.1).
- **Mã CŨ 14kt (SIM vật lý)**: `[Nước(3)][Vendor(2)][SốLượng(4): NNGB hoặc UNLI][Loại(2)][SốNgày(3): NND]`
  — VD `CHN3DUNLIP105D` = CHN·3D·UNLI·P1·05D. `Loại` = `P1` (Unlimited 10Mbps) / `P2` (Unlimited 5Mbps)
  khi `SốLượng=UNLI`; mã Daily/Fixed khác (SốLượng dạng `NNGB`) không cần giải mã `Loại` chi tiết — SQL
  (`SKU_TYPE_CASE` §3.1, nhánh `LIKE '%UNL%'`) đã lọc chỉ còn Unlimited trước khi tới FE.
- **Mã CŨ 15kt (eSIM)**: `'E' + [Nước(3)][Vendor(2)][Loại(2)][SốLượng(4)][SốNgày(3)]` — thứ tự
  `Loại`/`SốLượng` ĐẢO so với 14kt (Hiếu xác nhận, verify khớp dữ liệu thật). VD `ECHM3DP2UNLI03D` = E·CHM·3D·P2·UNLI·03D.
  ⚠️ Hiếu mô tả ban đầu KHÔNG nhắc ký tự `E` đầu (chỉ 14 ký tự nếu bỏ `E`) — verify SQL xác nhận `E` LUÔN
  có mặt trên dữ liệu thật, thiếu nó sẽ không khớp 15kt.
- Mã nước có thể chứa SỐ (VD `AP1`, `AS4`) — regex dùng `[A-Z0-9]`, không chỉ `[A-Z]`.
- **Verify độ phủ**: trong toàn bộ SKU 14/15kt chứa `"UNL"` (182 SKU distinct, tức true Unlimited theo SQL)
  — **182/182 (100%) khớp đúng 1 trong 2 regex** (`OLD_SIM_RE`/`OLD_ESIM_RE`, `page.tsx`): 91 `P1`, 90 `P2`,
  1 case lạ `Loại="PY"` nhưng `SốLượng=UNLI` (dữ liệu nguồn không nhất quán) — case này tự rơi vào nhánh
  "không rõ" ở dưới, không crash, không đoán bừa. Mã 14/15kt KHÔNG chứa "UNL" (không phải Unlimited, VD
  đơn vị `NNN M`/`NNHM` thay vì `GB`) không khớp regex nhưng KHÔNG SAO — chúng không bao giờ lọt vào tab
  Unlimited (SQL đã lọc trước), quy định "khác cấu trúc → rơi Khác" chỉ áp dụng cho SKU ĐÃ ở trong tab này.
  Mã cũ nào 14/15kt lọt vào tab Unlimited nhưng KHÔNG khớp 2 regex trên (hiếm, tuỳ dữ liệu) → rơi đúng vào
  `otherLengthGroup` ("Mã dài khác", §3.1d) — đúng yêu cầu Hiếu "để sang mục khác".

**Hợp nhất 3 vintage** — `resolveVariant(sku, vintage, meta)` trả về 1 shape chung
`{data, speed, label, unknown}` cho cả `speedGroups`/`speedGroupMembers` xử lý đồng nhất, thay hẳn hàm cũ
`variantLabelOf()`:
- Mã mới (13kt): ưu tiên `data`+`speed` (Supabase, số thật) → `throttle_speed` (text thật từ API) →
  **cảnh báo "⚠️ Không rõ chi tiết gói"** nếu cả 2 đều thiếu (Hiếu yêu cầu — TRƯỚC đây lùi về đoán
  `CODE_LABELS[letter]` ÂM THẦM, không báo gì, dễ hiểu nhầm là chắc chắn đúng).
- Mã cũ 14/15kt: giải mã trực tiếp `P1`/`P2` trong SKU → `Unlimited 10Mbps`/`Unlimited 5Mbps`; không khớp
  `P1`/`P2` (case `PY`+UNLI lạ nói trên, hoặc SKU không tra được cấu trúc) → cùng cảnh báo "không rõ".

`variantKeyOf()` đổi ưu tiên khoá gộp: có `data`/`speed` (số) → gộp theo số; không có nhưng có `label` text
(mã mới qua `throttle_speed`) → gộp theo text; còn lại → gộp "unknown" RIÊNG theo từng `(groupCode,
vintage)` (không trộn unknown của mã A với unknown của mã B).

Badge vintage đổi nhãn: "mã cũ · 14kt (SIM)" / "mã cũ · 15kt (eSIM)" (trước chỉ "mã cũ · 14kt" chung
chung, không phân biệt SIM/eSIM). Chart `sgChartName()` thêm nhánh hiển thị `{mã}·{speed}Mbps` khi biết
`speed` nhưng không biết `data` (đúng trường hợp mã cũ P1/P2).

Test: `parseOldSku()` verify độc lập ngoài app (node script) khớp 100% các case mẫu trước khi merge vào
`page.tsx` (không unit test riêng trong repo — hàm thuần không export). tsc + vitest (368/368) PASS.

**Bảng "Unlimited — Breakdown theo mã" (s200+4, gom theo ký tự phân loại; s202: tách thêm theo sub-variant
data/speed — xem §3.1d):**
| Cột | Nguồn / công thức |
|---|---|
| Mã | `typeLetterOfSku(sku)` + `skuVintage(sku)` (s200+9) — vị trí 8 (13 ký tự, "mã mới") / vị trí 10 (14 ký tự, "mã cũ") — LUÔN hiện kèm badge vintage, xem §3.1/§7. Dòng mô tả đầy đủ (VD "1GB high speed then drop to 10 mbps") lấy từ `variantLabelOf()` — §3.1d |
| Active SIMs | `Σ active_sims` các SKU cùng mã + cùng sub-variant (data/speed, §3.1d) |
| Total Plan (GB) | `Σ total_plan_gb` (= Σ data_amount_gb — hạn mức mềm) |
| Total Actual (GB) | `Σ total_usage_gb` |
| **GB/ngày/SIM** (thêm s95) | `Σ total_usage_gb ÷ Σ(active_sims × ngày)` — **KPI chi phí chính**; đỏ nếu > kế hoạch/ngày |
| Thực tế / Kế hoạch % | `avg_usage_pct` (= actual/plan). >100% = SIM dùng VƯỢT hạn mức 3HK cấp → chi phí datapool cao hơn dự kiến |
| Efficiency | thanh bar theo % (cap 100%) |

**Bảng chi tiết (mở "Chi tiết"):** SKU · Active SIMs · Total Plan (GB) · **Kế hoạch (GB/ngày/SIM)** = `total_plan_gb ÷ active_sims ÷ ngày` (= data_amount_gb ÷ ngày) · Total Actual (GB) · Avg. Usage % · **GB/ngày/SIM** = `total_usage_gb ÷ active_sims ÷ ngày`. Đỏ = thực tế > kế hoạch.

**🐛 BUG đã fix (s95):** trước đây cột "Giả định (GB/ngày/SIM)" + baseline biểu đồ dùng hằng `assumeGbPerDay` (10mbps→1.8, 5mbps→1.6). Nhưng `throttle_speed` thật: A=5mbps, B=10mbps → hằng cho A=1.6, B=1.8, **NGƯỢC** với `data_amount_gb` thật (A=1.8, B=1.6). ⇒ cùng 1 dòng, "Giả định" mâu thuẫn với "Total Plan"/"Usage %". **Fix:** bỏ `assumeGbPerDay`, lấy **kế hoạch/ngày = `data_amount_gb ÷ ngày`** (số thật của 3HK) ở mọi nơi → "Kế hoạch", "Total Plan", "Usage %", "GB/ngày/SIM" nhất quán tuyệt đối.

**Góc nhìn doanh nghiệp:**
- Gói Unlimited **không có cap cứng** → "Usage %" là **tỉ lệ Thực tế/Kế hoạch (cost vs budget)**, **>100% là bình thường** (nhiều SKU 120–355%) và nghĩa là **vượt chi phí datapool dự kiến** → rủi ro biên lợi nhuận. KPI cần theo dõi là **GB/ngày/SIM** (đã đưa lên cả cấp nhóm + summary card), không phải "Usage %" kiểu gói Fixed.
- Ngưỡng màu Usage% đổi mốc 100/80 (đỏ khi >100% = vượt budget) thay cho 80/50 (vốn hợp với gói Fixed).

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Active SIMs | `fact_data_usage` | `COUNT(DISTINCT (iccid, order_code))` bundle có `first_report_date` trong kỳ |
| Total Usage (GB) | `fact_data_usage.total_data_gb` | `SUM(total_data_gb)` — incremental usage mỗi snapshot |
| Total Capacity (GB) | `fact_data_usage.data_amount_gb` | `SUM(data_amount_gb)` — định mức/plan của gói |
| Avg. Usage % | Tính từ 2 cột trên | `SUM(total_data_gb) / SUM(data_amount_gb) × 100` (Weighted) |
| GB/ngày/SIM | `fact_data_usage` | `SUM(total_data_gb) ÷ (active_sims × số_ngày)` — KPI chính cho Unlimited |
| SKU Type | `fact_data_usage.sku` + `dim_sku` | Xem `SKU_TYPE_CASE` đầy đủ ở §3.1 (theo ký tự vị trí 8, không chỉ literal `%UNL%`) |
| Mã loại gói (Unlimited) | `fact_data_usage.sku` | `typeLetterOfSku(sku)` — vị trí 8 (13 ký tự) / vị trí 10 (14 ký tự), xem §3.1/§7 |
| Sub-variant Unlimited (data/speed) | Supabase `skus.data`/`skus.speed`/`skus.throttle_speed` | Tra qua `POST /api/analytics/3hk-sku-meta` (merge client-side với `skuMetrics` từ gohub_dw — 2 DB tách biệt, không JOIN SQL được), xem §3.1d |
| Zone × Month (TB) | Supabase `ncc_3hk` + `data_usage_log` (qua `countryRows`, không render riêng từ s200+10) | Zone A=A1+A2 gộp, B/C/D nguyên; alias tên nước USA/UK/Slovak Republic; bấm zone → drill-down nước (s200+9/+10). Cửa sổ tự tính `MAX(report_date)-23 tháng`, độc lập filter trang |
| Vendor filter | `dim_sku.vendor` | `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'` |
