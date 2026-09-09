---
title: "Inventory (Tồn Kho & Kế Hoạch Nhập Hàng)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, inventory, restock, po, ops, warehouse]
created: 2026-06-28
updated: 2026-09-06
status: active
---

# Inventory (Tồn Kho & Kế Hoạch Nhập Hàng)

> **s195+11 (2026-09-09) — feedback team OPS, sub-tab "Tồn kho".** Đã verify trực tiếp schema thật trên
> staging (SQL Query, Dev Tools) trước khi code, không đoán. Làm được: tách **VN/US** theo `company_code`
> thật (JOIN `fact_fulfillment_revenue`, KHÔNG đoán qua ký tự đầu SKU — 1 SKU prefix `E` từng thấy CẢ 2
> company khác nhau khi test), tách **SIM/eSIM** theo `dim_sku.type_of_sim` (đồng thời fix bug: field này
> trước bị gán nhầm vào biến hiển thị "Sản phẩm", nay dùng đúng `category_name` cho tên sản phẩm), thêm
> cột **"Bán tuần trước"** (SUM fulfilled_quantity tuần liền trước, Thứ Hai→Chủ Nhật), đổi **cảnh báo hết
> hàng sang 4 mức** (An toàn/Bình thường/Cần chú ý/Nguy hiểm) theo ngưỡng ngày tồn kho (DOI) **OPS tự cấu
> hình** qua `/analytics/settings` (không hardcode — `app_settings` key `inventory_alert_thresholds`, xem
> `lib/inventory-thresholds.ts`), mặc định 90/60/30 ngày. Thêm **Export Excel** (client-side, `xlsx`).
> Chuẩn bị sẵn cột **Mã lô** trong bảng breakdown theo kho (group theo `warehouse×batch×expired_date`) —
> **KHÔNG hiện dữ liệu** vì verify trực tiếp: `fact_inventory.batch` có cột nhưng 0/451 dòng có giá trị
> (ETL Sapo chưa sync lot-tracking); code đã sẵn sàng, tự tách nhiều dòng/kho khi ETL bổ sung, không cần
> sửa lại. **KHÔNG làm được** (blocker thật, cần Hiếu hỏi Sapo/ETL): "ngày nhập kho của lô" — cột không hề
> tồn tại trong `fact_inventory` (chỉ có `date` snapshot + `expired_date`); **ICCID** — không có bảng tồn
> kho per-unit nào trong gohub_dw (ICCID chỉ có ở `fact_data_usage`/`data_usage_log`, dùng cho usage 3HK,
> khác hoàn toàn tồn kho vật lý/eSIM). tsc + lint (0 lỗi mới) + vitest (212/212) PASS. Chưa tự QA UI qua
> Chrome (chờ deploy staging) — xem checklist QA trong CLAUDE.md.

> **s160 (2026-08-25) — thay hoàn toàn nội dung cũ.** Tab từng là "Inventory Management" (theo dõi tồn kho theo kho vật lý PQ/DD/TSN + vendor balance, xây từ s147) — đã bỏ hoàn toàn theo yêu cầu Hiếu. Thay bằng **kế hoạch nhập hàng theo tuần từng SKU (VN/US)** + **PO tracker**, dựa theo file Ops dùng ngoài Intel `Plan nhập hàng theo tháng.xlsx`. Route/permission key giữ nguyên `/analytics/fulfillment` (id `"fulfillment"`).
>
> **s194 (2026-09-06) — thêm sub-tab "Tồn kho" thật.** gohub_dw có thêm 2 bảng mới (`fact_inventory` +
> `dim_warehouse`, Sapo sync qua ETL, ~1 tuần dữ liệu tính đến lúc làm) — trang giờ có **2 sub-tab**: **Tồn
> kho** (mới, mặc định — dữ liệu thật theo SKU × kho, tốc độ bán, hạn dùng, cảnh báo, trend theo ngày) và
> **Kế hoạch nhập hàng** (nội dung cũ y nguyên, chỉ thêm 1 chỗ: "Tồn thực tế" tuần đang chạy giờ tự gợi ý
> từ `fact_inventory` thay vì luôn trống — đóng đúng TODO ở mục Gotchas cũ). Đối chiếu kỹ 2 file Lark OPS
> đang dùng thật ("Plan nhập hàng theo tháng" + "INVENTORY REPORT 2026" — sheet SIM có Stock/Available for
> sale/Expired date left/Inventory Age/Last 15-30 days Sold, sheet Draft v2 là pivot SKU×kho) trước khi
> build, không đoán cấu trúc cột.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/fulfillment` — `web/src/app/(dashboard)/analytics/fulfillment/page.tsx` (2 sub-tab: `stock`/`plan`) |
| UI sub-tab Tồn kho | `web/src/components/inventory/stock-view.tsx` |
| API Tồn kho (mới) | `GET /api/analytics/inventory-stock` — đọc `fact_inventory`+`dim_warehouse`+`dim_sku`+`fact_fulfillment_revenue` (gohub_dw) |
| API ngưỡng cảnh báo | `GET/POST /api/config/inventory-alert-thresholds` — `lib/inventory-thresholds.ts` (Supabase `app_settings`, POST admin/creator) |
| API watchlist | `GET/POST/PATCH/DELETE /api/analytics/inventory-plan/skus` |
| API lưới tuần | `GET/POST /api/analytics/inventory-plan/weekly` |
| API PO | `GET/POST/PATCH/DELETE /api/analytics/inventory-po` |
| Logic gợi ý | `web/src/lib/inventory-plan.ts` (thêm `getLatestStock()` s194) |
| Import 1 lần | `web/scripts/import_inventory_plan.mjs` |

## 2. Data model (Supabase, migration `v42_inventory_plan.sql`)
- **`inventory_plan_skus`** — watchlist SKU cần theo dõi: `sku_code, company_code(VN/US), vendor, target_weeks_coverage(mặc định 8), safety_weeks(mặc định 3), lead_time_weeks(mặc định 4), note, is_active`.
- **`inventory_plan_weekly`** — dữ liệu ô lưới, khoá `(sku_code, week_start_date)`: `actual_stock` (OPS ghi đè tay nếu muốn — mặc định tuần đang chạy tự lấy từ `fact_inventory`, xem mục 2b), `sales_forecast` + `sales_forecast_auto`, `import_qty` + `import_qty_auto`. `*_auto=false` = OPS đã ghi đè tay, không bị gợi ý tính lại đè lên.
- **`inventory_po`** — PO tracker (thay sheet "PO Dự kiến nhập" + bỏ hẳn `vendor_balances`): vendor/sku/qty + 4 mốc ngày (hết hàng dự kiến/cần có hàng/trễ nhất thanh toán/có hàng dự kiến) + trạng thái thanh toán/giao hàng.
- Bảng cũ `inventory_items/inventory_snapshots/vendor_balances` **không bị xoá** (không có migration gốc nên không viết DROP) — chỉ ngừng dùng trong code, còn tồn tại vô hại trên Supabase.

## 2b. Data model — Tồn kho thật (gohub_dw, s194)
- **`fact_inventory`**: `date, warehouse(FK dim_warehouse.code), batch, sku, quantity, expired_date`. Snapshot
  theo NGÀY (Sapo sync qua ETL) — mỗi ngày 1 dòng/SKU/kho. `batch` hiện luôn NULL (chưa dùng lot-tracking).
  `quantity` là số dư (data pool/SIM) tại kho đó ở đúng ngày `date`, KHÔNG phải số nhập/xuất trong ngày.
- **`dim_warehouse`**: `code, name, type(MAIN/BRANCH), is_active, sapo_location_id, address...`. ~10 kho
  (1 MAIN "Kho Tổng" + BRANCH: Bạch Đằng-HCM, Cầu Giấy-HN, Tân Sơn Nhất-HCM, eSIM Only, B2B Only HN,
  ViettelPost HN, Topup Portal, Testing, Undefined — 2 kho cuối là rác/test, không lọc riêng, tự nhiên có
  `quantity=0` mọi SKU nên không ảnh hưởng số liệu).
- Dữ liệu MỚI (~1 tuần tính đến s194) — trend theo ngày sẽ ngắn lúc đầu, dài dần theo thời gian ETL chạy
  tiếp mỗi ngày, KHÔNG cần OPS tự copy tab Lark mới như trước.

## 3. Logic gợi ý (server-side, `lib/inventory-plan.ts`)
Cho mỗi SKU, dựng chuỗi tuần cố định (2 tuần gần nhất "Actual" làm ngữ cảnh + N tuần tới "Forecast", mặc định N=14 qua param `weeks`), roll forward:
```
velocity = SUM(fulfilled_quantity) 30 ngày gần nhất (gohub_dw fact_fulfillment_revenue, GROUP BY TRIM(sku)) / 30 × 7
liveStock = SUM(quantity) fact_inventory mọi kho, ngày snapshot mới nhất (getLatestStock(), s194)
đầu tuần[0] = actual_stock OPS đã nhập tay, else (đúng tuần chứa ngày snapshot) liveStock, else 0
mỗi tuần:
  bán dự kiến = OPS ghi đè, else velocity
  tồn trước-khi-nhập = đầu tuần − bán dự kiến
  gợi ý nhập = tồn trước-khi-nhập < safety_weeks×velocity
             ? max(0, target_weeks_coverage×velocity − tồn trước-khi-nhập) : 0
  số nhập = OPS ghi đè, else gợi ý nhập
  cuối tuần = tồn trước-khi-nhập + số nhập
  đầu tuần[kế tiếp] = cuối tuần
cảnh báo: coverage(đầu tuần/velocity) < safety_weeks → "Nguy hiểm"; < target_weeks_coverage → "Cần chú ý"; else "Đủ hàng"
"Cần đặt PO ngay" = tuần thiếu hụt đầu tiên rơi trong vòng lead_time_weeks kể từ hôm nay
```
Query velocity dùng đúng pattern trailing-30d đã có ở hệ thống (`fulfiled_date::date <= CURRENT_DATE-1`), bọc `cachedAnalyticsQuery` (cache 12h — data gohub_dw chỉ đổi 1 lần/ngày).

## 4. UI

### 4a. Sub-tab "Tồn kho" (mới, mặc định, s194 — mở rộng s195+11 theo feedback OPS)
- 4 `StatTile`: SKU theo dõi (theo filter đang chọn), SKU nguy hiểm, sắp hết hạn (<30 ngày), số kho đang có hàng.
- Trend chart (area, `CHART_PALETTE[0]`): tổng tồn kho mọi SKU×kho theo ngày, 30 ngày gần nhất.
- Filter: mức cảnh báo · **Kho (VN/US/Tất cả)** · **Loại (SIM/eSIM/Tất cả)** · search SKU/vendor/tên SP.
- Bảng SKU: mã SKU, sản phẩm (`dim_sku.category_name`)/vendor, badge SIM/eSIM (`type_of_sim`), thị trường
  VN/US, tổng tồn kho, tốc độ bán/ngày (30d), **bán tuần trước** (SUM tuần liền trước, T2→CN), ước tính số
  ngày còn hàng (đỏ/vàng theo ngưỡng cấu hình), hạn dùng gần nhất + số ngày còn (đỏ <14, vàng <30), badge
  cảnh báo 4 mức. Click dòng → expand breakdown theo kho×lô (tồn kho, % tổng, **mã lô** — hiện luôn trống,
  hạn dùng riêng).
- **Export Excel** (nút góc trên): xuất đúng danh sách đang filter, 1 dòng/kho/SKU, gồm SKU/sản phẩm/loại/
  thị trường/vendor/tổng tồn/tốc độ bán/bán tuần trước/DOI/HSD/cảnh báo/kho/mã lô/tồn theo kho/HSD theo kho.
- **Alert logic** (`alertFor()` trong route, ngưỡng lấy từ `/api/config/inventory-alert-thresholds`,
  OPS tự set qua Settings): tồn=0 mà còn bán → `critical`; tồn=0 không bán → `none` (inactive); còn lại so
  DOI (ngày tồn = tồn hiện tại ÷ tốc độ bán/ngày) với 3 ngưỡng — dưới `warningDays` → `critical`, dưới
  `normalDays` → `warning`, dưới `safeDays` → `normal`, còn lại → `safe`. Mặc định 30/60/90. HSD (hạn dùng)
  KHÔNG gộp vào badge này nữa (tô màu đỏ/vàng riêng ở cột Hạn dùng) — đúng công thức OPS đưa (thuần DOI).
- **Market (VN/US)**: JOIN `fact_fulfillment_revenue.company_code` theo SKU, lấy company xuất hiện nhiều
  nhất trong lịch sử bán (mode). SKU chưa từng bán (không có lịch sử) → fallback đoán qua ký tự đầu SKU
  (1-6=VN, A-E=US, quy ước cũ của `import_inventory_plan.mjs`) — CHỈ dùng khi không tra được company thật,
  vì đã verify 1 SKU cùng prefix có thể thuộc cả 2 company.

### 4b. Sub-tab "Kế hoạch nhập hàng" (giữ nguyên từ s160)
- Toggle thị trường **VN/US** đầu trang.
- Banner cảnh báo: số SKU "Nguy hiểm" + số SKU "cần đặt PO trong lead time tới" — click để filter.
- Bảng tổng quan 1 dòng/SKU: Vendor · Tồn hiện tại · Vận tốc bán/tuần · Số nhập tuần này (badge "(gợi ý)" nếu chưa OPS chỉnh) · Badge cảnh báo · mở rộng.
- Row mở rộng → lưới tuần: cột = tuần (mốc ngày + tag Actual/Forecast), 5 dòng: Tồn thực tế (input) / Đầu tuần (readonly) / Bán dự kiến (input, prefill gợi ý) / Số nhập (input, prefill gợi ý) / Cuối tuần (readonly, đỏ nếu âm). Ô nét đứt = số auto chưa chỉnh; gõ số → ghi đè, lưu riêng theo từng SKU.
- Modal thêm/sửa SKU watchlist: `target_weeks_coverage/safety_weeks/lead_time_weeks/note`, vendor tự lookup `dim_sku` nếu để trống.
- PO Tracker (card riêng dưới): bảng đúng cột sheet Excel gốc, edit-mode batch-save + thêm dòng mới, pill màu trạng thái thanh toán/giao hàng.
- Export Excel: xuất lưới tuần (mọi SKU đang hiển thị) ra file.

## 5. Import dữ liệu Excel ban đầu
`node scripts/import_inventory_plan.mjs "<đường dẫn file Plan nhập hàng theo tháng.xlsx>"` (chạy trên máy có `web/.env.local`) — đọc sheet `Plan VN`/`Plan US` (map từng SKU 5-dòng → SKU watchlist + dữ liệu tuần, `week_start_date` suy từ mốc "as of" ở hàng 0 cộng dồn 7 ngày/cột) và sheet `PO Dự kiến nhập` (map thẳng cột → `inventory_po`). Ô nào Excel đã có số ở Bán dự kiến/Số nhập → import kèm `*_auto=false` để giữ đúng số Ops đã tính.

## 6. Gotchas
- **Verify trực tiếp staging s195+11 (2026-09-09)**: TẤT CẢ 7 kho trong `dim_warehouse` đều ở VN (Bạch
  Đằng-HCM/Cầu Giấy-HN/Tân Sơn Nhất-HCM/eSIM Only/Kho Tổng + 2 kho rác) — **không có kho US nào** trong
  `fact_inventory`. VN/US vì vậy tách theo SKU (company_code), KHÔNG phải theo kho vật lý.
- **`fact_inventory.batch`** có cột nhưng luôn NULL tính đến s195+11 (0/451 dòng có giá trị) — chờ Sapo/ETL
  sync lot-tracking. **Không có cột "ngày nhập kho của lô"** nào trong `fact_inventory` (chỉ `date` snapshot
  + `expired_date`) — OPS muốn xem cần Sapo/ETL bổ sung nguồn trước, không tự thêm được (Hiếu không có DDL).
- **ICCID không có trong `fact_inventory`/`dim_warehouse`** — chỉ có ở `fact_data_usage`/`data_usage_log`
  (usage 3HK theo bundle, KHÁC hoàn toàn tồn kho vật lý/eSIM per-unit). Muốn export ICCID cần 1 bảng tồn
  kho per-unit mới trong gohub_dw, chưa tồn tại.
- **s194+11 (2026-09-06)**: UI — phần "Kế hoạch nhập hàng" (PO tracker + lưới tuần, giữ nguyên logic) còn
  sót `blue-*` (16 chỗ, cả `stock-view.tsx`) → `brand-*`. Sub-tab "Tồn kho" đã StatTile từ s194+5, không đổi
  lần này. Không đổi logic/data.
- **[ĐÃ XONG s194]** ~~`actual_stock` chưa có nguồn tự động~~ — `gohub_dw` đã có `fact_inventory`, tuần đang
  chạy tự lấy `getLatestStock()` làm gợi ý (`actualStockAuto=true`) khi OPS chưa ghi đè tay. Chỉ áp cho
  ĐÚNG tuần chứa ngày snapshot mới nhất — tuần tương lai/quá khứ vẫn trống nếu chưa nhập (fact_inventory
  chỉ mới có từ s194, chưa đủ lịch sử để backfill các tuần cũ).
- **`fact_inventory.quantity` là số dư, không phải số nhập/xuất trong ngày** — muốn tính "đã nhập/xuất bao
  nhiêu" phải lấy hiệu số giữa 2 ngày snapshot liên tiếp, KHÔNG có sẵn 1 cột riêng cho việc này.
- **2 kho rác trong `dim_warehouse`** (`testing`, `undefined`) — không lọc riêng vì `quantity` luôn ~0,
  không ảnh hưởng tổng; nếu sau này có dữ liệu thật ở 2 kho này thì cần xem lại có nên loại khỏi tổng không.
- `sku_code` tuần suy company_code từ ký tự đầu (VN=`1-6`, US=`A-E`) khi import — nếu SKU lạ không khớp pattern, script import bỏ qua/để null, cần bổ sung tay qua UI.
- Migration `v42_inventory_plan.sql` cần Hiếu chạy trên Supabase trước khi tab có dữ liệu; sau đó chạy script import 1 lần.
- Máy dev chính (không có `web/.env.local`) không tự chạy được migration/import/test live — cần Hiếu verify trên staging trước merge main.

## 7. Phân quyền
- **XEM**: `admin, creator, manager, staff, bod, ops-&-cs` (giữ nguyên `READ_ROLES` từ tab cũ).
- **SỬA** (thêm/sửa/xoá SKU, lưu lưới tuần, PO): `admin, creator, manager, staff` qua `canWriteTab(username, "fulfillment", WRITE_ROLES)` — hoặc user được cấp quyền riêng ở `/analytics/users` → "Quyền chỉnh sửa" (label hiển thị: "Inventory Plan (kế hoạch nhập hàng)").
