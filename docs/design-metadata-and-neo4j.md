# Thiết Kế: Tách JSON Metadata (Item 4) & Bỏ Neo4j → pgvector (Item 5)

> Trạng thái: **ĐỀ XUẤT — chờ Hiếu duyệt trước khi triển khai** (đều chạm production DB + pipeline sync).
> Cập nhật: 2026-07-14 (Session 88).

---

## ITEM 4 — Tách dữ liệu sản phẩm: core relational + `metadata` JSONB

### Mục tiêu
Giữ **cột lõi** (lọc/join/tính toán) dạng quan hệ; gom **cột mô tả** (hiển thị/tra cứu, ít filter) vào 1 cột `metadata JSONB` → dễ sửa/thêm field không cần migration, giảm số cột.

### Phân loại đề xuất

**`products`** (35 cột → 10 core + `metadata`)
- Core: `product_code`(PK) · `status` · `tenant` · `vendor_code` · `type_of_sim` · `product_type` · `operator_code` · `data_type` · `supported_countries` · `synced_at`
- `metadata`: apn, apn_original, kyc_code, kyc_needed, kyc_links, top_up_options, activation, activation_time, unsupported_apps, telco_perks, note, hotspot, local_phone_number, local_number_country, daily_reset_time, network_type, onsite_carrier, source_type, sku_type, import_type, purchase_type, base_sim_esim_sku_code, data_plan_type, date_created, last_modified_date

**`skus`** (18 cột → 12 core + `metadata`)
- Core: `sku_code`(PK) · `product_code`(FK) · `status` · `tenant` · `sim_esim` · `product_type` · `data_amount`(+unit) · `day_amount`(+unit) · `throttle_speed` · `vendor_sku` · `latest_cogs`(+currency) · `final_cogs_included_vat_vnd`/`final_cogs_usd`
- `metadata`: call, call_sms_details, frame, datapack, expirations, currency, wr_group, vendor_sku_sim, original_cost, reference_cost_vnd, date_created, last_modified_date

**`listings`** (45 cột → 8 core + `metadata`) — ứng viên mạnh nhất
- Core: `listing_code`(PK) · `reference_product_code`(FK) · `status` · `tenant` · `listing_type` · `type_of_sim` · `product_type` · `category_code`
- `metadata`: toàn bộ cặp EN/VN mô tả (listing_name_en/vn, data_type_en/vn, kyc_*, activation_*, hotspot_*, telco_perks_*, note_*, call_sms_details_*, top_up_options_*, unsupported_apps_*, special_activation_*, local_phone_number_*, network_operator, daily_reset_time_*, expirations_en/vn, apn) → ~37 cột gom 1 JSONB.

### Bước triển khai (staging-first, từng bảng một)
1. **Migration**: `ALTER TABLE <t> ADD COLUMN metadata JSONB DEFAULT '{}'` (giữ nguyên cột cũ để rollback).
2. **Sửa `sync.py`**: gom field mô tả vào dict `metadata` khi upsert (thay vì cột rời). Giữ cột core.
3. **Backfill**: script gom cột cũ → metadata cho các row hiện có (1 lần).
4. **Cập nhật đọc**: các endpoint/agent đọc cột mô tả → đọc `metadata->>'field'`.
   - ⚠️ **`sku_catalog` là DẪN XUẤT** — sửa `sync_sku_catalog()` + MỌI `.select(...)` trong `tools.ts`/`bi-analyst.ts`/`context.ts` cho khớp (bài học Session 88: select lệch cột `call_sms_details` = vỡ ÂM THẦM toàn bộ search).
5. **Index**: `CREATE INDEX ... USING GIN (metadata)` nếu cần query field trong JSONB.
6. **Cutover**: sau khi verify, mới DROP cột cũ (đợt sau, không cùng lần).

### Rủi ro
- `sku_catalog` rebuild mỗi lần sync → phải đồng bộ schema mới + select. **Đây là điểm dễ vỡ nhất.**
- Hiếu KHÔNG có quyền đụng DB gohub_dw — nhưng products/skus/listings/items ở **Supabase** (có quyền). OK.
- Query field trong JSONB chậm hơn cột indexed nếu dùng để filter nhiều → chỉ đưa field ÍT filter vào JSONB.

---

## ITEM 5 — Bỏ Neo4j → Supabase pgvector

### Hiện trạng (đã kiểm tra Session 88)
- **Neo4j instance ĐÃ CHẾT**: probe trả "No routing servers available" (Aura free bị pause/xóa).
- Hệ quả: `searchSkusSemantic` (fallback tu-van khi search chính = 0), `/api/recommendations`, `/api/semantic-search` **đã âm thầm lỗi từ lâu** (đều try/catch → trả []/500).
- Đường tư vấn CHÍNH (searchSkus) KHÔNG dùng Neo4j → đã fix riêng (bug call_sms_details, Session 88).

### Đề xuất: gỡ Neo4j, thay bằng pgvector (Supabase đã có sẵn)
Supabase đã dùng `vector(3072)` cho `kb_wiki_pages` (embedding Gemini). Áp cùng cơ chế cho SKU:
1. **Bảng embedding SKU**: thêm cột `embedding vector(3072)` vào `sku_catalog` (hoặc bảng `sku_embeddings` riêng) + hàm `search_skus_semantic(query_embedding, match_count)` (giống `search_wiki`).
2. **Sinh embedding**: script embed `sku_code + mô tả` (như `import_wiki.py`) → lưu Supabase. Chạy sau mỗi sync (hoặc cron).
3. **Sửa `searchSkusSemantic`** (tools.ts): thay `runQuery` (Neo4j) → embed query bằng Gemini → gọi RPC `search_skus_semantic` trên Supabase.
4. **`/api/recommendations`, `/api/semantic-search`**: chuyển sang pgvector tương tự (hoặc gỡ nếu UI không dùng — cần kiểm tra caller).
5. **Gỡ Neo4j**: xóa `lib/neo4j-client.ts`, `neo4j-driver` (package.json), `scripts/*neo4j*`, workflow `neo4j_sync.yml`, env NEO4J_*.

### Lợi ích
- 1 nguồn sự thật (Supabase), bớt 1 hệ thống + 1 workflow + 1 dependency nặng.
- Hết lệch sync / instance chết âm thầm.

### Lưu ý
- Kiểm tra `/api/recommendations` + `/api/semantic-search` có được UI gọi không trước khi gỡ (nếu có → phải reimplement pgvector; nếu không → gỡ luôn).
- Embedding 8.877 SKU × Gemini = chi phí/thời gian 1 lần (như wiki, ~0.8s/row) → cân nhắc batch.

### Phương án tối giản (nếu chưa cần semantic)
Vì searchSkus (đường chính) đã tốt, có thể **chỉ gỡ Neo4j chết** + để searchSkusSemantic trả [] (đã vậy sẵn) — reimplement pgvector sau khi cần. Ít rủi ro nhất.
