# B2C Performance (Hiệu Suất Bán Lẻ B2C)

Báo cáo bán lẻ B2C bố cục 5 section (Apple-style, giảm tải nhận thức): doanh thu rolling, khách hàng, CAC/Leads, tỷ lệ chuyển đổi website, và chi phí marketing/ROAS. Tích hợp nhiều nguồn ngoài (Chatwoot, GA4, Turso).

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: đo hiệu quả kênh bán lẻ end-to-end — từ lead → khách mới → doanh thu → chi phí marketing → ROAS — để biết tiền marketing đẻ ra bao nhiêu doanh thu.
- **Tại sao 5 section tách biệt**: mỗi câu hỏi kinh doanh (bán được bao nhiêu? khách ở đâu ra? tốn bao nhiêu để có khách? web chốt tốt không? quảng cáo lời không?) là 1 section riêng → dễ đọc.

## 2. Đường dẫn & file
- **Web**: `/analytics/b2c` — `web/src/app/(dashboard)/analytics/b2c/page.tsx` (+ `components/b2c-advanced-dashboard.tsx`)
- **API**: `/api/analytics/b2c/{monthly, kpis, trend, loss-skus}`

## 3. Cấu trúc 5 section
- **S1 Revenue Rolling**: doanh thu 6 tháng VN/US/Total + tiến độ MTD/MoM/Prorata so KPI.
- **S2 Customers**: khách mới (New) vs quay lại (Returning), có MoM.
- **S3 CAC & Leads**: leads từ Chatwoot → so đơn thực tế (conversion).
- **S4 Website CR**: tỷ lệ mua trên web từ GA4.
- **S5 Marketing Cost & ROAS**: ngân sách vs chi phí thực + ROAS + spend pace.

## 4. Công thức nghiệp vụ
$$\text{CAC} = \frac{\text{Chi phí Marketing thực tế}}{\text{Số khách hàng mới}} \qquad \text{ROAS} = \frac{\text{Doanh thu B2C}}{\text{Chi phí Marketing thực tế}}$$
$$\text{Spend Pace} = \frac{\text{Chi phí thực tế}}{\text{Ngân sách Marketing B2C}} \times 100\% \qquad \text{CR} = \frac{\text{Khách mua thực tế}}{\text{Tổng Leads}} \times 100\%$$

## 5. Nguồn dữ liệu chi tiết (lấy gì, từ đâu, tại sao)
- **Doanh thu/Profit**: analytics DB (`fact_fulfillment_revenue`, `dim_order_source`), lọc B2C. `Revenue`, `COGS`, `Gross Profit`, `Margin %`, `CM1`, `CM1%` lấy theo kênh thật.
- **Customers**: Admin GoHub Internal API `/v1/internal/customers/revenue`, lấy `summary.byUserType` page 1 để có New/Returning mà không quét nhiều page.
- **Leads**: ưu tiên **Turso chat center**, fallback **Omni**, fallback **Chatwoot**. Lead tính theo nguồn B2C: Live Chat, WhatsApp, Zalo, Facebook/Messenger, Instagram. Lead được tính khi trạng thái thuộc nhóm New Lead, Sales Consulting, Waiting Payment, Need Sales Follow-up, Purchased; không tính No Need, Handover To CS, Internal Checking, Order Issue, Resolved, Troubleshoot. **Lưu ý**: Zalo cá nhân chưa tracking nên lead hiện tại có thể thấp hơn thực tế.
- **Website CR**: **GA4** — config 2 property lưu `app_config['ga4_configs']` (Turso, đã copy sang Supabase).
- **Marketing Spend**: `analytics_channel_group_costs`, có `manualSpendOverrides` tạm thời cho tháng 5-7/2026 trong preview.
- **Budget**: lấy từ Manage Costs → B2C Channels (`analytics_channel_costs`), nhưng card Budget đã bỏ khỏi snapshot KPI strip.

## 6. Vấn đề đã gặp & cách khắc phục
- **Spend/leads thiếu nguồn (S67-70)**: GA4 2 property + leads ở omni riêng → thiết kế đọc đa nguồn (Chatwoot/GA4/Turso) thay vì chỉ gohub_dw.
- **Không cache (S81)**: `b2c/{kpis,performance,trend,loss-skus}` trước gọi thẳng DB → chậm. Fix: `cachedQuery` 12h.
- **Đổi term CM1 (S74)**: label margin đổi GP2→CM1, giữ key `gpm2`.
- **Cấu hình đặt sai chỗ (S82)**: "KPI Target B2C" + "Ngân sách Marketing B2C" trước nằm trong Admin → chuyển về KPI/Target cho đúng ngữ cảnh.

## 7. Phân quyền
- Xem: **Admin, Creator, Manager, BOD, Staff**.
- **Ẩn methodology + nút sửa ngân sách**: chỉ **Admin/Creator** (sửa giá trị thực hiện ở KPI/Target).

---

## 8. B2C Report Preview — luồng cần giữ khi đưa lên Git

> Note ngày 2026-07-15: bản preview local đang ở `/b2c-report-preview`, component chính `web/src/components/b2c-advanced-dashboard.tsx`, API chính `web/src/app/api/analytics/b2c/monthly/route.ts`.

### Nguyên tắc vận hành production
- Dashboard dùng cho nhiều người nên **không gọi live toàn bộ nguồn mỗi lần mở trang**.
- Luồng đúng là: cron chạy hằng ngày lúc **00:00 UTC+7** → kéo dữ liệu từ các nguồn → ghi snapshot/cache có `refreshed_at` → dashboard chỉ đọc snapshot/cache.
- `vercel.json` đã có cron `0 17 * * *` tương ứng 00:00 UTC+7.
- Route cron đã có: `/api/cron/refresh-b2c-report`.
- Trước khi deploy cần sửa lỗi snapshot hiện tại: log local đang báo `Invalid API key`, cần kiểm tra `SUPABASE_SERVICE_KEY` và chạy migration `web/db/migrations/v17_b2c_report_monthly_snapshots.sql`.

### Nguồn dữ liệu chuẩn theo metric
- **Revenue B2C / channel breakdown**: analytics DB hiện tại (`fact_fulfillment_revenue`, `dim_order_source`), lọc B2C.
- **Revenue & Gross Profit Trend**: analytics DB, theo source channel thật. Công thức: `Gross Profit = Revenue - COGS`, `Margin % = Gross Profit / Revenue`, `CM1 = Gross Profit - Operation Cost`, `CM1% = CM1 / Revenue`.
- **Customer Total/New/Returning**: Admin GoHub Internal API `/v1/internal/customers/revenue`, lấy **summary page 1** và `summary.byUserType` để tránh load nặng. Không scan item-level live.
- **Lead**: ưu tiên Turso chat center, fallback Omni, fallback Chatwoot.
- **Spend/Budget**: spend từ `analytics_channel_group_costs` + override tạm preview; budget từ `analytics_channel_costs`/Manage Costs B2C Channels.
- **GA4**: đọc config qua `/api/config/ga4`, dùng cho website conversion chart.

### Customer New/Returning — quyết định kỹ thuật
- Admin API trả summary nhanh:
  - `summary.customerCount`
  - `summary.totalOrders`
  - `summary.byCurrency[]`
  - `summary.byUserType.new`
  - `summary.byUserType.returning`
- Dashboard dùng `summary.byUserType` để tính New/Returning count và revenue; không quét từng page vì tháng 7/2026 có hơn 270 pages.
- Lưu ý reconciliation: revenue từ Admin API là `SUM(finalAmount)` theo `Order.createdAt`; revenue top/dashboard là `fulfilled_revenue_amount_vnd` theo `fulfilled_date`, nên có thể lệch. Nếu cần doanh thu customer khớp top revenue thì phải dùng analytics DB cho revenue và Admin chỉ dùng count.

### Lead / Zalo
- Lead được tính theo trạng thái:
  - Tính: `New Lead`, `New Lead EC`, `Sales Consulting`, `Waiting Payment`, `Need Sales Follow-up`, `Purchased`
  - Không tính: `No Need`, `Handover To CS`, `Internal Checking`, `Order Issue`, `Resolved`, `Troubleshoot`
- Turso chat center hiện đọc trực tiếp từ `messages`, `identities`, `conversation_statuses`, `channels`, `channel_groups`.
- Omni có `channel_groups` gồm `Zalo`, nhưng `/api/conversations` cần `OMNI_API_TOKEN`; `OMNI_WEBHOOK_SECRET` chỉ dùng verify webhook, không đọc history conversations.

### Spend tạm hardcode cần gỡ trước khi merge
Trong `web/src/app/api/analytics/b2c/monthly/route.ts` đang có `manualSpendOverrides` để preview CPL:
- `2026-05`: `86,633,334 + 20,099,340 + 26,188,452 = 132,921,126`
- `2026-06`: `93,239,567 + 2,989,734 = 96,229,301`
- `2026-07`: `128,000,000`

Trước khi đưa lên Git/prod, nên nhập các số này vào nguồn thật (`analytics_channel_group_costs`/Cost Management) rồi xóa override.

### Công thức quan trọng đã chốt
- **MTD compare**: so current MTD với cùng số ngày của tháng trước.
- **Quarter prorata**: QTD chia số ngày đã trôi qua trong quý, nhân tổng ngày của đủ 3 tháng trong quý. Ví dụ Q3 = tháng 7+8+9, không chỉ lấy tháng 7.
- **CPL**: `Spend ÷ Leads`.
- **CAC / khách**: `Spend ÷ Khách mới`. KPI card và Acquisition table dùng cùng công thức total spend / total new customer.
- **Tỷ lệ chốt**: `Customer ÷ Leads`.
- **KPI cards hiện tại**: `Users`, `ROAS`, `Customers`, `CAC`, `Leads`, `CPL`; đã bỏ card Budget.

### Env vars cần set cho deploy
- `ADMIN_GOHUB_API_BASE_URL`
- `ADMIN_GOHUB_API_KEY`
- `ADMIN_GOHUB_API_SECRET`
- `ADMIN_GOHUB_USD_TO_VND`
- `TURSO_URL`
- `TURSO_AUTH_TOKEN`
- `CHATWOOT_BASE_URL`
- `CHATWOOT_ACCOUNT_ID`
- `CHATWOOT_API_TOKEN`
- `OMNI_API_BASE_URL`
- `OMNI_API_TOKEN` (optional fallback nếu dùng Omni)
- `OMNI_WEBHOOK_SECRET` (chỉ verify webhook, không dùng để đọc history)
- `CRON_SECRET` (nên set trên Vercel để bảo vệ cron)
- `SUPABASE_SERVICE_KEY` phải là service role key hợp lệ để snapshot/cache đọc ghi được.

### Checklist trước khi merge/deploy
- [ ] Chạy migration snapshot `web/db/migrations/v17_b2c_report_monthly_snapshots.sql`.
- [ ] Đảm bảo cron `/api/cron/refresh-b2c-report` chạy được 00:00 UTC+7.
- [ ] Gỡ `manualSpendOverrides` sau khi nhập spend thật.
- [ ] Kiểm tra Turso lead token hoặc fallback Omni/Chatwoot.
- [ ] Kiểm tra Customer New/Returning bằng `summary.byUserType`.
- [ ] Kiểm tra local build `npm run build`.
