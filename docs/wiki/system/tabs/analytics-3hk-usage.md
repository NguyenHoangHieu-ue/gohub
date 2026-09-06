---
title: "3HK Data Usage (Theo Dõi Tiêu Hao Data 3HK)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, 3hk]
created: 2026-06-28
updated: 2026-07-15
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
| **API dữ liệu bảng** | `POST /api/analytics/query` (SELECT-only) — FE tự sinh SQL rồi gửi |
| **API nhóm tốc độ Unlimited** | `GET /api/analytics/3hk-speed-map` |
| **Bảng nguồn (analytics)** | `gohub_dw.fact_data_usage` + `gohub_dw.dim_sku` |
| **Bảng nguồn (product)** | Supabase `skus` (cột `throttle_speed`, cho phân loại Unlimited) |

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

### 3.1 Phân loại loại gói (Daily/Fixed/Unlimited)
Tin theo **mã SKU**, không tin cột `sku_type` (mã mới từng bị gán nhầm):
```sql
CASE WHEN UPPER(sku) LIKE '%UNL%' THEN 'Unlimited Data' ELSE sku_type END
```

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

## 7. Phân loại nhóm tốc độ gói Unlimited

Tab **Unlimited** có bảng "Breakdown theo gói (high-speed × throttle)" + biểu đồ. Nhóm được tính SERVER-side ở **`/api/analytics/3hk-speed-map`**. Có tối đa **3 nhóm**: `500MB·5mbps`, `500MB·10mbps`, `1GB·10mbps`.

### 7.1 Mã cũ vs mã mới
| Loại mã | Ví dụ | Cách phân loại |
|---|---|---|
| **CŨ** (code-based) | `ECHN3DP1UNLI05D`, `CHN3DUNLIP205D` | Theo P-code: **P2 → 5mbps (500MB)**, **P1 → 10mbps (500MB)**, **PY → 1GB·10mbps** |
| **MỚI** (`[AB]UNL`) | `EACHN3DBUNL05`, `3ACHN3DAUNL03` | Ưu tiên đọc cột **`throttle_speed`** (Supabase `skus`); fallback theo chữ: **A → 5mbps**, **B → 10mbps** |

- Đối chiếu chéo đã xác nhận nhất quán: **A↔P2 (5mbps)**, **B↔P1 (10mbps)**.
- Chuỗi `throttle_speed` dạng `"500 MB high speed then drop to 10 mbps"` → parse ra mbps + có "1GB" hay không.

### 7.2 Dung lượng 500MB vs 1GB
- **Chỉ suy được từ `throttle_speed`** (không suy được từ chữ A/B — chữ chỉ mã hoá tốc độ).
- **Hiện tại (T6/2026): TẤT CẢ gói mới đều 500MB** — không có mã mới 1GB nào trong catalog/usage. "1GB·10mbps" chỉ còn **1 mã PY cũ** (`ECHM3DPYUNLI05D`).
- ⚠️ Nếu 3HK ra gói **1GB** sau này, team SP **phải ghi `throttle_speed` chứa "1GB..."** trong Supabase `skus` thì speed-map mới bắt đúng (nếu không, sẽ bị xếp nhầm 500MB).

### 7.3 Backfill throttle_speed (Session 93)
- 55/147 mã UNL mới từng thiếu `throttle_speed` → đã backfill (suy từ mã cùng họ / chữ A/B, toàn 500MB, 0 conflict) → speed-map giờ đọc nguồn chuẩn cho 100% mã mới.

### 7.4 Giả định để so sánh
- GB/ngày/SIM giả định theo throttle (spec NCC): **10mbps → 1.8 GB/ngày**, **5mbps → 1.6 GB/ngày**. Biểu đồ tô **đỏ** khi thực tế vượt giả định, **xanh** khi trong giả định.

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

## 6. Sub-report: Data Usage by Country × Month (TB) — thêm s95

Bảng phụ trong tab 3HK, mô phỏng báo cáo NCC "Data Usage by Country x Month (TB)". **Độc lập** với kỳ/tab của bảng chính (mount effect riêng, chạy 1 lần).

- **Nguồn**: `data_usage_log` (log thô từng ngày — cột `report_date`, `country`, `data_gb`). KHÔNG dùng `fact_data_usage` (bảng đó không có `country`).
- **Đơn vị**: TB = `SUM(data_gb) / 1024`.
- **Query** (gom dạng "dài" rồi pivot client-side, tránh crosstab SQL động):
  ```sql
  SELECT COALESCE(NULLIF(TRIM(country),''),'Unknown') AS country,
         to_char(report_date,'YYYY-MM') AS ym,
         SUM(data_gb)/1024.0 AS tb
  FROM data_usage_log
  WHERE report_date IS NOT NULL
    AND report_date >= (SELECT MAX(report_date) FROM data_usage_log) - INTERVAL '11 months'
  GROUP BY 1,2 ORDER BY 1,2
  ```
- **Pivot (FE)**: top 16 nước theo tổng TB + gộp phần còn lại vào **OTHERS**; mỗi dòng có cột **Total** + **Run-rate 12M** (= TB tháng mới nhất × 12); dòng cuối **GRAND TOTAL** (mọi nước). Nút **CSV** export (dấu chấm thập phân, BOM UTF-8).
- **Gotcha**:
  - Phải lọc `report_date IS NOT NULL` — có ~358k dòng report_date NULL (≈318 TB) sẽ làm sai GRAND TOTAL nếu gộp.
  - Nhãn tháng EN viết hoa (JAN…DEC); nếu bảng trải nhiều năm thì thêm `'YY`. Số format vi-VN 2 chữ số (dấu phẩy) khớp mẫu "16,92".
  - DB hiện chỉ có **Jan–Jun 2026** (6 tháng) → bảng render động theo tháng CÓ THẬT (ảnh NCC gốc 10 tháng là data cũ hơn).
- **Đối chiếu** (T6/2026): China 131,91 · Japan 15,00 · South Korea 6,88 · **GRAND TOTAL 186,80** TB — khớp DB thật.
- **File**: `web/src/app/(dashboard)/analytics/3hk-usage/page.tsx` (state `countryMonths/countryRows/countryGrand`, `fmtTB`, `monthLabel`, `exportCountryCsv`).

---

## 7. Tab "Unlimited" — Breakdown theo gói (audit cột + góc nhìn doanh nghiệp, s95)

**Nguồn dữ liệu (fact_data_usage, gom qua `bundlesCTE` → `fetchSKUMetrics`)** — mỗi SKU:
- `active_sims` = `COUNT(*)` bundle (iccid+order_code có usage trong kỳ).
- `total_plan_gb` = `SUM(data_amount_gb)`. **Với gói Unlimited, `data_amount_gb` KHÔNG phải 9999** mà = **mức 3HK cấp/ngày × số ngày** (đã đối chiếu DB: **A = 1.8 GB/ngày, B = 1.6 GB/ngày**; mã cũ IP1/PY→1.8, IP2→1.6). Đây là "hạn mức mềm" (fair-use), không phải cap cứng.
- `total_usage_gb` = `SUM(total_data_gb)` — data thực dùng (cả phần đã throttle vẫn tính chi phí datapool).
- `avg_usage_pct` = `total_usage_gb / total_plan_gb × 100`.
- Số ngày gói: `daysOfSku(sku)` (mã mới `…UNL05`→5; mã cũ `…05D`, bỏ token P1/P2 trước).

**Bảng "Unlimited — Breakdown theo gói" (cấp nhóm high-speed × throttle):**
| Cột | Nguồn / công thức |
|---|---|
| Nhóm tốc độ | `speedMap[sku].group` (API `3hk-speed-map`, đọc `throttle_speed` Supabase: A="drop to 5 mbps", B="drop to 10 mbps"; mã cũ theo P-code) |
| Active SIMs | `Σ active_sims` các SKU trong nhóm |
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
| SKU Type | `fact_data_usage.sku` + `dim_sku` | `CASE WHEN UPPER(sku) LIKE '%UNL%' THEN 'Unlimited Data' ELSE sku_type END` |
| Nhóm tốc độ (Unlimited) | Supabase `skus.throttle_speed` | API `/api/analytics/3hk-speed-map`; A=5mbps, B=10mbps; mã cũ P1/P2/PY |
| Country × Month (TB) | `data_usage_log` | `SUM(data_gb)/1024` GROUP BY `country`, `to_char(report_date,'YYYY-MM')` |
| Vendor filter | `dim_sku.vendor` | `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'` |
