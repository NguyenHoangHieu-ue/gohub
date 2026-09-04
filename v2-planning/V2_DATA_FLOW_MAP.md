# V2_DATA_FLOW_MAP.md — Sơ đồ Luồng Dữ liệu & Quan hệ Cơ sở Dữ liệu (BA Master Blueprint)

> **Tài liệu Đặc tả Luồng Nghiệp vụ (Data Flow & DB Mapping)**: Được biên soạn bởi Chuyên gia Phân tích Nghiệp vụ (Lead Business Analyst) nhiều năm kinh nghiệm. Tài liệu mô tả bức tranh luồng dữ liệu tổng thể và sơ đồ quan hệ của toàn hệ thống GoHub Intel v2.

---

## I. SƠ ĐỒ TOÀN CẢNH LUỒNG DỮ LIỆU CHUNG (MASTER DATA FLOW PIPELINE)

Hệ thống GoHub Intel v2 thu thập dữ liệu từ các nguồn khác nhau, đồng bộ và phân tích chéo thông qua kiến trúc 3 vùng lưu trữ độc lập:

```
                  [Nguồn Dữ Liệu Gốc - Raw Data Sources]
                                 │
         ┌───────────────────────┼───────────────────────┐
         │ (GCP Cloud)           │ (Lark Base API)       │ (Obsidian Wiki)
         ▼                       ▼                       ▼
    [GCP Postgres]        [Lark Webhook]        [Tài liệu .md]
         │                       │                       │
         │ (Nightly Sync)        │ (Real-time Capture)   │ (Parser & Chunker)
         ▼                       ▼                       ▼
   [gohub_dw GCP]         [Supabase Log]        [Gemini Embedding]
 (Kho dữ liệu BI)      (Hàng chờ duyệt SLA)     (pgvector Supabase)
         │                       │                       │
         └───────────────┬───────┴───────────────────────┘
                         │
                         ▼
             [Unified Data Core (v2)]
                 - core/db Client
                 - core/formulas Engine
                 - core/cache (L1 + L2)
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
 [BI Dashboards / APIs]          [Multi-Agent Chatbot]
   - Web App Render                - Gấu Gợi Ý / Tư Vấn
   - Recharts Ellipsis             - Gấu Pro SQL Explorer
   - Excel / PDF Output            - Lark Auto-Response
```

---

## II. QUAN HỆ GIỮA CÁC CƠ SỞ DỮ LIỆU & BẢNG NGUỒN (DATABASE RELATIONSHIPS)

Hệ thống hoạt động dựa trên 3 CSDL chính, được kết nối chéo qua mã định danh chuẩn (Mã khách hàng, Mã SKU, Mã kênh):

### 1. Kho dữ liệu Báo cáo Phân tích — PostgreSQL `gohub_dw`
Vùng dữ liệu kiểm toán tài chính và hoạt động bán hàng thực tế:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ fact_fulfillment_revenue / fact_sales_revenue                   │
  ├─────────────────────────────────────────────────────────────────┤
  │ - order_code (Mã đơn hàng)                                      │
  │ - order_source_code ───► JOIN dim_order_source.code             │
  │ - customer_code ────────► JOIN dim_customer.code (TRIM)          │
  │ - staff_code ───────────► JOIN dim_staff.code                   │
  │ - sku ──────────────────► JOIN dim_sku.sku                       │
  │ - fulfiled_date (TEXT, cast DATE) / created_date                │
  │ - fulfilled_revenue_amount_vnd / sales_revenue_amount_vnd       │
  │ - cogs_amount_vnd                                               │
  │ - gross_profit_vnd                                              │
  └─────────────────────────────────────────────────────────────────┘
```
*   **dim_order_source**: Cung cấp `channel_name` (Kênh bán), `group_name` (Phân khúc B2B/B2C), và `sapo_name` (Sub-channel).
*   **dim_customer**: Cung cấp `name` (Tên khách sỉ) và `price_list_name` (Dùng để phân loại Tiers).
*   **dim_sku**: Cung cấp `vendor` (WorldMove, 3HK Datapool), `category_name` (Loại SIM/eSIM), và `type_of_sim`.
*   **dim_staff**: Cung cấp `name` (Tên nhân viên kinh doanh phụ trách).

### 2. Cơ sở dữ liệu Cấu hình & Trực quan — Supabase PostgreSQL
Vùng dữ liệu quản lý vòng đời ứng dụng, Tri thức Wiki và lưu trữ KPI Targets:

```
  ┌─────────────────────────┐         ┌─────────────────────────┐
  │ app_settings (JSONB)    │         │ b2b_customer_targets    │
  ├─────────────────────────┤         ├─────────────────────────┤
  │ - fx (USD/VND, HKD/USD) │         │ - id ({Q-Year}_{code})  │
  │ - 3hk (Coefficients)    │         │ - target_rev (Revenue)  │
  │ - partner_tiers (Tiers) │         │ - target_cm1 (CM1)      │
  │ - b2c_kpi_targets       │         │ - target_3hk_pct (%)    │
  └─────────────────────────┘         └─────────────────────────┘
  ┌─────────────────────────┐         ┌─────────────────────────┐
  │ kb_wiki_pages           │◄────────┼ kb_wiki_page_groups     │
  ├─────────────────────────┤         ├─────────────────────────┤
  │ - id (UUID)             │         │ - page_id (FK)          │
  │ - title / content       │         │ - group_id (FK)         │
  │ - visibility_mode       │         │   (Ràng buộc Tổ Gấu)    │
  └─────────────────────────┘         └─────────────────────────┘
```

### 3. Cơ sở dữ liệu Cấu hình Chi phí động — Turso SQLite
Vùng dữ liệu siêu nhẹ phục vụ cập nhật nhanh chóng các chi phí sỉ:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ b2b_customer_cost_monthly                                       │
  ├─────────────────────────────────────────────────────────────────┤
  │ - id (TEXT PK - {month}_{customer_code})                        │
  │ - month (TEXT - YYYY-MM)                                        │
  │ - customer_code (TEXT) ────► Ánh xạ dim_customer.code          │
  │ - cost_lines (JSON text) ──► Array chi phí động [{name, val}]   │
  │ - updated_by / updated_at                                       │
  └─────────────────────────────────────────────────────────────────┘
```

---

## III. SƠ ĐỒ LUỒNG ĐI ĐIỂM (NESTED PIPELINES)

### 1. Luồng Tính toán CM1 sỉ B2B (B2B CM1 Flow)
Để tính ra CM1 sỉ chuẩn xác đến từng Sub-channel của một khách hàng:

```
   [gohub_dw]                                        [Turso SQLite]
 Query Doanh thu & GP                             Query Chi phí tháng
   theo customer_code                            theo customer_code
        │                                                │
        ▼                                                ▼
   (Margin VND)                                    (Cost lines JSON)
        │                                                │
        │                                                │ (Phân rã mảng)
        │                                                ▼
        │                                     Tính chi phí thực tế (VND)
        │                                      - Amount: Cộng trực tiếp
        │                                      - Percent: % × Revenue
        │                                                │
        ▼                                                ▼
   (GP Customer)  ◄──────────────────────────────  (Total CH.Cost)
        │
        ▼ (Phân bổ tỷ trọng Doanh thu xuống các Sub-channels)
   [CM1 Sub-channel = (GP Sub - CH.Cost phân bổ - Group Cost phân bổ)]
```

### 2. Luồng Capture SLA Lark chat real-time (Lark SLA Pipeline)
Quy trình nhận diện và đo lường SLA tự động:

```
 [Lark Group Chat] ──► [Lark Events Webhook] ──► [Supabase log]
                        - verify signature        - okr_lark_message_log
                        - decode AES payload
                                                        │
                                                        ▼
                                                 [Thread Parser]
                                                 - Gộp tin nhắn chung
                                                   Thread Root ID
                                                        │
                                                        ▼
                                                 [Gemini 3.6 Flash]
                                                 - Classify intent (SLA)
                                                 - Extract request_time
                                                 - Extract completion_time
                                                        │
                                                        ▼
                                                 [Supabase Event Queue]
                                                 - Trạng thái: pending_review
                                                        │
                                                        ▼
                                                 [Admin Approve Queue]
                                                 - Hiếu bấm Xác nhận/Sửa
                                                        │
                                                        ▼
                                                 [Official Metrics]
                                                 - Đưa vào OKRs Report KPI 1
```
