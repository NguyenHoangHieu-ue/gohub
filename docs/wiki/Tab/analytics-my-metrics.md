---
title: "My Metrics — OKR Tracking (Hiếu)"
page_type: tab_guide
department: tech
audience: system
visibility: admin-only
is_hidden: true
tags: [my-metrics, okr, analytics, sla, sku, gm, begau]
created: 2026-08-27
updated: 2026-08-27
status: active
---

# My Metrics — OKR Tracking

> Route `/analytics/my-metrics` (id `"my-metrics"`), gate qua `my_metrics_enabled` (`/api/user/me`) + `access_audit_log`.
> Đối tượng: cá nhân Hiếu, dùng để báo cáo OKR Q3/Q4 2026 cho manager (Bảo). Nguồn KPI chính thức: offer letter
> "Product Operations Executive (AI & Data Focus)" — 5 KPI, trọng số time-allocation 70% Operational Excellence +
> Product Performance / 30% BI & AI Automation.

## Rebuild s164 (2026-08-27) — vì đâu

Trước s164: (1) SLA/Vendor Speed 100% tự nhập tay không audit trail; (2) SKU GM tính blended TOÀN công ty
(không khớp câu target "GM tăng trên SKU trọng điểm/mới"); (3) Tasks Bé Gấu đếm mọi chat company-wide không lọc
gì; (4) `okr_evidence_records` tạo tay ngoài Supabase, không có migration file. → Sếp không tin số. Fix theo 3
quyết định Hiếu chốt (không tự đoán):

1. **SKU GM**: giữ CẢ 2 số — "verified" (chính, auto từ SKU được tag) + "blended toàn công ty" (context phụ, nhãn rõ "không phải KPI chính").
2. **Tasks Bé Gấu**: vẫn đếm toàn công ty (đúng tinh thần "AI Agent giúp Sales/CSKH/Ops") nhưng lọc bỏ response quá ngắn (<15 ký tự) + breakdown theo `user_role`.
3. **SLA/Vendor Speed**: chưa có event hệ thống thật để tự động hoá (product onboarding vẫn thủ công) → giữ manual nhưng siết chặt trust.

## Cấu trúc dữ liệu

| Nguồn | Bảng/API | Ghi chú |
|---|---|---|
| Auto — %3HK, GM blended, Bé Gấu tasks | `GET /api/analytics/my-metrics` | gohub_dw + Supabase `app_usage_events`, cutoff `CURRENT_DATE-1` |
| Auto — SKU GM verified | `GET/POST/DELETE /api/analytics/my-metrics/sku-tags` | Supabase `okr_sku_tags` (chỉ lưu sku_code+ngày áp dụng) + query LIVE `fact_fulfillment_revenue` trước/sau ngày áp dụng — **không nhập tay số margin** |
| Manual — SLA/Vendor Speed evidence | `GET/POST/DELETE /api/analytics/my-metrics/evidence` | Supabase `okr_evidence_records`, bắt buộc đủ 2 ảnh (request+completion) mới tính vào TB, khoá sau khi quý đóng (`isQuarterLocked`) |
| Target theo quý | `GET/PATCH /api/analytics/my-metrics/manual` | `app_settings` key `okr.<Q>-<year>` |
| Conversation drill-down | `GET /api/analytics/my-metrics/conversations` | Xem lại từng cuộc hội thoại được tính vào task count |
| Migration | `web/db/migrations/v44_okr_tracking.sql` | Ghi lại schema `okr_evidence_records` (đã tồn tại từ trước, tạo tay) + tạo mới `okr_sku_tags` + cột audit `updated_by/updated_at` |
| Shared helpers | `web/src/lib/okr-helpers.ts` | `quarterRange`, `parseQuarterLabel`, `isQuarterLocked`, `OKR_GM_BASELINE=36.7`, `OKR_HK3_BASELINE=67.5` |

## 5 KPI (Q3 target theo offer letter, Q4 hardcode `DEFAULT_TARGETS` trong `page.tsx`)

| # | KPI | Target Q3 | Cách tính chính thức |
|---|---|---|---|
| 1 | SLA Handling Time | ≤5h, 80% requests | Evidence tự nhập (2 ảnh bắt buộc) → TB duration verified |
| 1 | Vendor Selection Speed | ≤15 phút/query | Evidence tự nhập, tương tự |
| 2 | SKU Gross Margin | +2.5% GM SKU trọng điểm/mới | **Verified**: tag SKU + ngày áp dụng → so margin THẬT trước/sau (gohub_dw). SKU mới (không có "trước") so với baseline công ty 36.7%. Weighted theo revenue sau áp dụng. |
| 2 | %3HK + Datapool Vendor | 74% revenue | `SUM(rev WHERE vendor 3HKDATAPOOL)/SUM(rev)` toàn công ty — auto, không đổi cách tính |
| 3 (w=30%) | Tasks via Bé Gấu | 450/quý | `app_usage_events` chat có `ai_response` dài ≥15 ký tự, company-wide (Web+Lark), breakdown theo `user_role` |

**Weighted OKR Score** (card đầu trang) = Σ(đạt-%ᵢ × trọng-sốᵢ)/100, trọng số `WEIGHTS` trong `page.tsx`:
SLA/VendorSpeed/SKU-GM/%3HK mỗi thứ 17.5% (chia đều trong nhóm 70%, offer letter không ghi trọng số riêng từng
chỉ số) + Bé Gấu 30%. Đạt-% cap 0–100%, SLA/Vendor Speed dùng công thức "thấp hơn = tốt" (`achLowerBetter`).

## Gotchas

- **Quarter lock**: `isQuarterLocked(label)` = `true` khi hôm nay > ngày cuối quý → evidence + SKU tag của quý đó không sửa/xoá được nữa (API 403), chỉ đọc. Mục đích: sếp xem số quý trước sẽ không bị đổi ngược.
- **Verified vs total**: evidence thiếu 1 trong 2 ảnh vẫn lưu (minh bạch là có ghi nhận) nhưng KHÔNG cộng vào số trung bình KPI — UI hiển thị badge "Thiếu ảnh — không tính KPI" màu vàng riêng.
- **SKU mới không có "trước"**: `delta` tính so với `OKR_GM_BASELINE` (36.7%, chốt từ ảnh baseline T8/2026) thay vì so chính nó — nếu baseline đổi phải sửa hằng số trong `okr-helpers.ts`, KHÔNG hardcode lại ở nơi khác.
- **SKU chưa có đơn hàng sau ngày áp dụng** → status `pending`, không tính vào `weighted_delta` (tránh chia 0/số ảo).
- **`ManualMetrics`** trước s164 có 5 field chết (`sla_time/sla_pct/vendor_speed/gm_baseline/gm_actual`) không hiển thị ở đâu — đã xoá khỏi interface + API, chỉ giữ `target_*`.
- **Bé Gấu task ≠ "thành công" theo nghĩa nghiêm ngặt** — chỉ lọc được độ dài response (không có structured success flag từ `be-gau.ts`, response tự do Gemini). Nếu muốn phân loại chuẩn hơn cần thêm cột đánh giá thủ công hoặc structured output ở `be-gau.ts` (chưa làm, out of scope s164).
