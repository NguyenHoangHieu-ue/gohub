# GoHub — Product Management & Business Intelligence Platform

> Hệ thống quản lý sản phẩm, phân tích kinh doanh và AI chatbot tích hợp cho GoHub.

## Tổng Quan

GoHub PM là nền tảng nội bộ hợp nhất **2 hệ thống**:
- **GoHub PM** (trước đây): quản lý catalog SIM/eSIM, NCC, KB nội bộ
- **gohub-intel** (đã merge vào): Business Intelligence, báo cáo doanh thu, phân tích kênh bán

**Production:** [gohub-murex.vercel.app](https://gohub-murex.vercel.app)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript, Tailwind CSS) |
| Deploy | Vercel (auto-deploy từ `main` branch) |
| Auth | NextAuth.js v4 + bcrypt + Lark OAuth |
| Product DB | Supabase (PostgreSQL + pgvector) |
| Analytics DB | PostgreSQL `gohub_dw` (internal — liên hệ team lead) |
| AI | Google Gemini (gemini-3.5-flash + gemini-embedding-001) |
| Bot | Lark Bot (p2p + group + thread) |
| Sync | GitHub Actions cron (daily 01:00 UTC) |

---

## Cấu Trúc Repo

```
├── web/                    # Next.js application (main codebase)
│   ├── src/
│   │   ├── app/            # App Router pages + API routes
│   │   │   ├── (dashboard)/    # Protected pages (login required)
│   │   │   │   ├── analytics/  # BI pages (dashboard, BOD, B2B, B2C, orders...)
│   │   │   │   ├── admin/      # Admin panel (users, settings, template, scheduler)
│   │   │   │   ├── chatbot/    # GoHub AI chatbot
│   │   │   │   ├── skus/       # SP Hệ Thống (products, SKUs, listings, items)
│   │   │   │   ├── ncc/        # SP Vendor (WM, 3HK catalog)
│   │   │   │   ├── kb/         # Knowledge Base (docs + wiki)
│   │   │   │   └── ...
│   │   │   └── api/            # API routes
│   │   ├── lib/            # Shared utilities
│   │   │   ├── agents/     # AI agent system (5 agents)
│   │   │   ├── analytics-db.ts   # gohub_dw PostgreSQL connection
│   │   │   ├── analytics-helpers.ts  # SQL helpers + caching
│   │   │   ├── supabase.ts    # Supabase client
│   │   │   └── lark.ts        # Lark Bot API helpers
│   │   └── components/    # Shared UI components
│   └── package.json
├── sync/                   # GitHub Actions sync scripts (Python)
│   ├── sync.py             # GoHub API → Supabase (daily)
│   └── gohub_api_clients.py
├── database/
│   ├── migrations/         # Supabase SQL migrations (v1–v15)
│   └── import/             # One-time import scripts
├── scripts/                # Utility scripts
│   └── migrate_turso_tickets.py  # Turso → Supabase ticket migration
├── docs/
│   ├── session_summary.txt # Dev session log
│   ├── MERGE_PLAN.md       # gohub-intel merge plan (completed)
│   └── wiki/               # GoHub internal wiki (synced to Supabase)
├── Data/                   # Reference xlsx files (trigger sync actions)
└── _Skills_AI/             # AI coding guidelines
    └── agents/AGENTS.md    # Agent system documentation
```

---

## AI Agent System

GoHub có **5 chuyên gia AI** xử lý các loại câu hỏi khác nhau:

| Agent | Trigger | Chức năng |
|---|---|---|
| `tu-van` | Tìm gói đi nước X | Tư vấn SIM/eSIM từ GoHub catalog |
| `tra-cuu` | SKU/Product code cụ thể | Tra cứu chi tiết + COGS + FX rates |
| `giai-dap` | Nghĩa mã, quy trình | Giải thích thuật ngữ, cấu trúc mã |
| `gap-analysis` | Gap NCC | So sánh WM/3HK vs hệ thống GoHub |
| `bi-analyst` | Doanh thu, đơn hàng, kênh | Query gohub_dw → trả lời + vẽ biểu đồ |

Model: `gemini-3.5-flash` | Lark Bot: `Bé Gấu Thông Thái`

---

## Database

### Supabase (Product & App data)
- `products`, `skus`, `listings`, `items` — catalog sản phẩm
- `ncc_worldmove` (8,921 rows), `ncc_3hk` — NCC catalog
- `kb_documents`, `kb_chunks`, `kb_wiki_pages` — Knowledge Base
- `users`, `app_settings`, `notifications` — app config
- `lark_cs_tickets` (24,712 rows) — CS troubleshoot data
- `lark_scheduled_messages` — scheduled Lark messages
- `analytics_target_planning` — KPI targets

### gohub_dw (Analytics PostgreSQL)
- `fact_fulfillment_revenue`, `fact_sales_revenue` — doanh thu
- `fact_data_usage` — 3HK data usage
- `dim_order_source`, `dim_staff`, `dim_customer`, `dim_sku`, `dim_location`

### Supabase Migrations
Chạy theo thứ tự trong Supabase SQL Editor: `v1` → `v15`

---

## Setup Local

```bash
# 1. Clone
git clone https://github.com/NguyenHoangHieu-ue/gohub.git
cd gohub

# 2. Install dependencies
cd web && npm install

# 3. Environment variables
cp .env.example web/.env.local  # Điền các giá trị từ team

# 4. Run dev server
npm run dev  # → http://localhost:3000
```

### Env vars cần thiết (web/.env.local)

Liên hệ team lead để lấy file `.env.local`. Không commit file này lên GitHub.

---

## Roles & Permissions

| Role | Access |
|---|---|
| `admin` | Toàn quyền — admin panel, SQL Explorer, user management |
| `manager` | Analytics + product management + template |
| `bod` | Analytics (BOD Report, dashboard) |
| `staff` | Analytics (đọc) |
| `standard` | Chatbot + Khuyến mãi + Thông tin + KB (theo phòng ban) |

---

## Analytics Pages

| Route | Mô tả |
|---|---|
| `/analytics` | Dashboard tổng quan |
| `/analytics/bod` | BOD Report |
| `/analytics/all-time` | Historical performance |
| `/analytics/b2b`, `/b2c`, `/channels` | Phân tích kênh bán |
| `/analytics/orders` | Quản lý đơn hàng |
| `/analytics/staff` | Hiệu suất nhân viên |
| `/analytics/customers` | Phân tích khách B2B |
| `/analytics/vendors` | Vendor performance |
| `/analytics/products` | SKU performance |
| `/analytics/fulfillment` | Fulfillment report |
| `/analytics/cs-troubleshoot` | CS Troubleshoot Hub |
| `/analytics/3hk-usage` | 3HK Data Usage |
| `/analytics/targets` | KPI/Target planning |
| `/analytics/sql` | SQL Explorer (admin only) |

---

## GitHub Actions

| Workflow | Schedule | Mô tả |
|---|---|---|
| `sync.yml` | Daily 01:00 UTC | GoHub API → Supabase (products, SKUs, listings, items) |
| `data_sync.yml` | Push Data/ + Daily 02:00 UTC | Reference data (countries, vendors, FX rates) |
| `neo4j_sync.yml` | After sync | Neo4j graph sync (semantic search fallback) |

---

## Liên hệ

- **Owner:** Hiếu ([@NguyenHoangHieu-ue](https://github.com/NguyenHoangHieu-ue))
- **Lark Bot:** Bé Gấu Thông Thái
- **Production:** [gohub-murex.vercel.app](https://gohub-murex.vercel.app)
