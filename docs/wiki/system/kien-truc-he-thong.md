---
title: "GoHub Second Brain — Kiến Trúc & Flow Diagram"
page_type: reference
department: tech
audience: system
visibility: admin-only
is_hidden: true
tags: [architecture, diagram, second-brain, flow, mermaid, system]
aliases: ["Second Brain Architecture", "System Diagram", "Flow Diagram"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-08-22
status: active
---

# GoHub Second Brain — Kiến Trúc & Flow

> ⚠️ **Cập nhật s131+ (2026-08-09)**: Chatbot đã đổi kiến trúc — xem mục "Trạng thái hiện tại" bên dưới.

---

## Trạng thái hiện tại (2026-08-09)

### Chatbot — Bé Gấu mới (s131)

**Bé Gấu (chatbot team)** nay dùng `be-gau.ts` (1 agent function-calling, thay pipeline 6-agent):
- 1 vòng lặp ≤12 iterations, Gemini tự chọn tool phù hợp
- Tools: `executeSQL` (gohub_dw), `querySupabase`, `listSupabaseTables`, `queryProduct`, `queryGA4`, `queryGSC`, `webSearch`, `readKnowledgeBase`
- Guardian pre-flight vẫn giữ → route chặn system_internal trước khi vào be-gau
- Diagram 5 bên dưới mô tả pipeline cũ (legacy, vẫn tham khảo được về logic agent)

**Gấu Pro (creator only)** = `creator-ai.ts`, 16+ tools, max 20 iterations, không guardian:
- Wave 1 (s138): thêm `getTrendSnapshots` + `generateImage` (Pollinations AI FLUX)
- Cron `refresh-trends` chạy 8h ICT → trend_snapshots Supabase

### Analytics — OOP pattern (s133+)

Tất cả tính toán projection + cost chuyển về BE (route.ts), FE chỉ display:
- `analytics-engine/projection.ts` → `getProjectionFactor()`
- `analytics-engine/cost-engine.ts` → `COST_KEYS`, `calcChCostForPeriod()`, `calcChannelOpCost()`
- `analytics-engine/quarter-projection.ts` → `buildQuarterMonthMeta()`

### Deploy

- **Vercel** (không còn Netlify từ s76)
- Cron: 5 jobs (prewarm, refresh-kpis, refresh-b2c, scheduled-messages, refresh-trends)
- Staging domain: `stg-intel-v2.gohub.cloud`

---

---

## Diagram 1 — Tổng Quan Hệ Thống (Big Picture)

```mermaid
flowchart TB
    subgraph SRC ["NGUON DU LIEU"]
        direction LR
        A1["GoHub API\nProducts · SKUs\nListings · Items"]
        A2["NCC Files\nWM Excel/CSV\n3HK Excel"]
        A3["Documents\nPDF · DOCX · MD · TXT"]
        A4["Wiki Editor\nViet truc tiep\ntren web"]
        A5["Lark Chat\nMessage history\ntheo thread"]
    end

    subgraph PROC ["XU LY"]
        direction LR
        B1["GitHub Actions\nSync daily 01:00 UTC\nsync.py → Supabase\n(Done)"]
        B2["NCC Import\nParse → Diff → Confirm\n(Done)"]
        B3["KB Pipeline\nParse → Chunk 800ch\n→ Embed 3072d\n(Done)"]
        B4["Wiki Save\nEmbed + Version history\n(Done)"]
        B5["MRP Pipeline\nAI Map→Reduce\n→Plan→Commit\n(Chua lam)"]
    end

    subgraph DB ["SUPABASE STORAGE"]
        direction LR
        C1[("Core Data\nproducts · skus\nlistings · items\nsku_catalog")]
        C2[("NCC Catalog\nncc_worldmove 8921 goi\nncc_3hk 45 zones\nncc_datapool")]
        C3[("Knowledge Base\nkb_documents\nkb_chunks\npgvector 3072d")]
        C4[("Wiki Pages\nkb_wiki_pages\nkb_wiki_versions\nversion history")]
        C5[("Chat & Users\nlark_chat_history\nconversations\nusers")]
        C6[("Reference\nref_countries 212\nref_support_countries 77\nref_vendors · app_settings")]
    end

    subgraph AI ["AI LAYER  (Gemini gemini-3.5-flash)"]
        direction TB
        D_CACHE[("Reference Cache\n30 min TTL\nnccWm 8921 · countries\nvendors · groupMap")]
        DG["Guardian Gate\nguardCheck() pre-flight\nchan cau hoi vuot quyen\n(role + dept + category)"]
        D0["Router Agent\nRule-based fast path\n+ Gemini classifier fallback"]
        D1["Tu Van\nGoHub SKUs\n4-step country fallback"]
        D2["Tra Cuu\nLookup ma\nCOGS + FX rates"]
        D3["Giai Dap\nKB + Wiki search\nThuat ngu · quy trinh"]
        D4["Gap Analysis (NCC & Gap)\nNCC catalog\nWM exist Yes/No"]
        D5["Tao Template\nXuat Excel template SP\ntu catalog WM/3HK"]
        D6["BI Analyst (Be Gau Bi-Ai)\nfunction-calling SQL\ngohub_dw (GCP Postgres)\n+ queryGA4 + queryGSC"]
    end

    subgraph MCP ["MCP SERVER\n(Done)"]
        E_MCP["9 Tools\nsearch_products · get_sku_detail\nsearch_ncc_catalog · search_kb\nget_fx_rates · get_promotions\nlist_vendors · decode_sku\nget_db_schema"]
    end

    subgraph OUT ["TRUY CAP"]
        direction LR
        F1["Web Chatbot\ngohub-intel.vercel.app\n/chatbot"]
        F2["Lark Bot\nBe Gau Thong Thai\np2p · group · thread"]
        F3["Claude Code\n← MCP Server\ngohub tool calls"]
        F4["Web UI Tabs\n/ncc (SP Vendor) · /kb · /kb#wiki\n/admin · /skus (SP He Thong:\nSan Pham gop+Listing+Item)"]
    end

    A1 -->|"batch 500/run"| B1 --> C1
    A2 -->|"admin/manager only"| B2 --> C2
    A3 -->|"max 10MB"| B3 --> C3
    A4 --> B4 --> C4
    A3 -.->|"Phase 3 - Chua lam"| B5 -.-> C4
    A5 --> C5

    C1 & C2 & C6 --> D_CACHE
    C3 & C4 --> D3
    C5 --> AI
    D_CACHE --> D0
    D0 --> D1 & D2 & D3 & D4

    AI --> F1 & F2 & F4
    AI --> E_MCP --> F3

    style B5 stroke-dasharray: 5 5
    style SRC fill:#f0f9ff,stroke:#0ea5e9
    style PROC fill:#fefce8,stroke:#eab308
    style DB fill:#f0fdf4,stroke:#22c55e
    style AI fill:#fdf4ff,stroke:#a855f7
    style MCP fill:#fff7ed,stroke:#f97316
    style OUT fill:#fef2f2,stroke:#ef4444
```

---

## Diagram 2 — AI Query Pipeline (Chi Tiết Luồng Xử Lý 1 Câu Hỏi)

```mermaid
sequenceDiagram
    actor User as User
    participant UI as Web / Lark
    participant Router as Router
    participant Gemini_C as Gemini Classifier
    participant Cache as Cache (30m)
    participant DB as Supabase
    participant Agent as Agent
    participant Gemini_G as Gemini Stream

    User->>UI: Nhap cau hoi
    UI->>Router: POST /api/chat

    Note over Router: extractParams()<br/>Detect: country, days, GB,<br/>skuCodes, keywords

    alt Fast path - rule-based du
        Router->>Router: classifyAgent() ro rang
    else Khong chac
        Router->>Gemini_C: Classify intent
        Gemini_C-->>Router: agentId + params
    end

    Router->>Agent: buildToolContext(agentId, params)

    par Load ref data
        Agent->>Cache: supportCountries, nccWm, vendors
        Cache-->>Agent: Cached data (hoac fetch Supabase neu stale)
    and Load dynamic data
        Agent->>DB: searchSkus / getProductDetail<br/>searchKB / searchWiki / getFxRates
        DB-->>Agent: Query results
    end

    Agent->>Agent: Build context string<br/>(inject GoHub SKUs / NCC / KB / Wiki)

    Agent->>Gemini_G: systemPrompt + context + userMessage
    Gemini_G-->>UI: Stream text (tung token)
    UI-->>User: Hien thi realtime

    Note over UI: Lark: detect markdown table?<br/>→ Interactive Card + xlsx<br/>Web: react-markdown + GFM
```

---

## Diagram 3 — NCC Import Pipeline (Upload → Confirm)
(Done)

```mermaid
flowchart LR
    V["Vendor\ngui file"] --> U["Upload\nweb /ncc\nImport button"]

    U --> DET{"Auto-detect\nformat"}
    DET -->|"co cot wmproductId"| P1["WM Native Parser\nCSV hoac XLSX"]
    DET -->|"sheet Goi co san\nhoac cot vendor_code"| P2["GoHub Standard\nParser"]

    P1 --> SHA{"SHA-256\ncheck"}
    P2 --> SHA
    SHA -->|"file da import roi"| WARN["Canh bao\nfile khong doi"]
    SHA -->|"file moi"| CMP["Compare voi DB"]

    CMP --> NEW["San pham moi\nvendor_id chua co trong DB"]
    CMP --> CHG["Gia thay doi\nCOGS khac nhau"]
    CMP --> DIS["Ngung cung cap\nactive trong DB\nnhung khong co trong file"]

    NEW & CHG & DIS --> UI_REV["Review UI\nCollapsible sections\n5 mau dau moi nhom"]

    UI_REV -->|"Cancel"| ABORT["Khong lam gi"]
    UI_REV -->|"Confirm Import"| UPSERT

    subgraph UPSERT ["Upsert vao DB"]
        direction TB
        U1["INSERT / UPDATE\nncc_worldmove\nhoac ncc_datapool"]
        U2["Bao toan APN\napn · network_type\nproviders · coverage\nkhong bi overwrite"]
        U3["Mark inactive\nngung cung cap"]
        U1 --> U2
        U1 --> U3
    end

    UPSERT --> LOG["Log\ndata_file_registry\nsha256 · row_count\nlast_imported · status=ok"]
    LOG --> DONE["Done\nRefresh table"]

    style NEW fill:#dcfce7,stroke:#16a34a
    style CHG fill:#fef9c3,stroke:#ca8a04
    style DIS fill:#fee2e2,stroke:#dc2626
    style WARN fill:#fef3c7,stroke:#d97706
```

---

## Diagram 4 — Knowledge Base & Wiki Pipeline

```mermaid
flowchart TB
    subgraph INPUT ["Dau Vao"]
        direction LR
        F1["Upload File\nPDF · DOCX · MD · TXT\nmax 10MB"]
        F2["Viet Wiki\nMarkdown editor\ntren web /kb#wiki"]
    end

    subgraph KB_FLOW ["KB Pipeline (Done)"]
        direction LR
        K1["Parse\npdf-parse\nmammoth"] --> K2["Chunk\n800 chars\noverlap"] --> K3["Embed\ngemini-embedding-001\n3072 dims"] --> K4[("kb_chunks\npgvector")]
    end

    subgraph WIKI_FLOW ["Wiki Pipeline (Done)"]
        direction LR
        W1["Save\nkb_wiki_pages"] --> W2["Version\nkb_wiki_versions\n(luu ban cu)"] --> W3["Auto-embed\ntitle + content\n3072 dims"] --> W4[("kb_wiki_pages\n+ embedding")]
    end

    subgraph MRP_FLOW ["MRP Pipeline (Chua lam)"]
        direction LR
        M1["AI Map\nExtract entities\nvendor · products · dates"] --> M2["AI Plan\nList actions\nwiki pages to create/update"] --> M3["Human Review\nApprove / Reject\nper action"] --> M4["Commit\nAuto-create/update\nwiki pages"]
    end

    subgraph SEARCH ["Search Layer"]
        direction LR
        S1["Embed query\ngemini-embedding-001"] --> S2["Cosine similarity\nsupabase RPC\nsearch_kb"] --> S3["Top 8 results\nthreshold 0.4\nchunks + wiki merged"]
    end

    F1 --> KB_FLOW
    F2 --> WIKI_FLOW
    F1 -.->|"Phase 3 - Chua lam"| MRP_FLOW -.-> WIKI_FLOW

    KB_FLOW & WIKI_FLOW --> SEARCH
    SEARCH --> BOT["Chatbot\ngiai-dap agent\nInject KB context"]

    style MRP_FLOW stroke-dasharray: 5 5,fill:#fefce8
```

---

## Diagram 5 — 6 Agents + Guardian & Routing Logic

```mermaid
flowchart LR
    MSG["User Message"] --> GUARD{"Guardian Gate\nguardCheck()\nrole + dept + category"}
    GUARD -->|"vuot quyen / khac phong ban"| DENY["Tu choi lich su\n(badge Han che quyen)\nKHONG goi agent"]
    GUARD -->|"hop le (fail-open)"| ROUTER["Router\nextractParams() + Gemini classifier\n+ override xac dinh (BI/template/explain)"]

    ROUTER -->|"co country / tu khoa goi/eSIM"| TU_VAN
    ROUTER -->|"co ma SKU/Product/Item\nhoac COGS/ty gia"| TRA_CUU
    ROUTER -->|"tu khoa nghia/giai thich\ncau truc/thuat ngu"| GIAI_DAP
    ROUTER -->|"tu khoa NCC/gap/chua co\nphan tich/so sanh ncc"| GAP
    ROUTER -->|"tao/xuat template WM/3HK"| TEMPLATE
    ROUTER -->|"doanh thu/don hang/nhan vien\ntop ban chay/B2B-B2C"| BI

    subgraph TU_VAN ["Tu Van"]
        T1["searchSkus()\n4-step country fallback"]
    end
    subgraph TRA_CUU ["Tra Cuu"]
        T2["identifyCode()\ngetProductDetail()\nconvertCogs() · getFxRates()"]
    end
    subgraph GIAI_DAP ["Giai Dap"]
        T3["searchKB() · searchWiki()\ngetVendorInfo() · decodeSkuCode()"]
    end
    subgraph GAP ["NCC & Gap"]
        T4["findGaps()\nsearchNccWm() · searchNcc3hk()\nnccWmInSystem (exist=Yes)"]
    end
    subgraph TEMPLATE ["Tao Template"]
        T5["catalog WM/3HK theo nuoc\n→ Excel GoHub Standard"]
    end
    subgraph BI ["BI Analyst (Be Gau Bi-Ai)"]
        T6["runBIAnalyst()\nGemini function-calling\nexecuteSQL gohub_dw (GCP)\n+ queryGA4 + queryGSC"]
    end

    TU_VAN & TRA_CUU & GIAI_DAP & GAP & TEMPLATE & BI --> CTX["Context String\nbuildToolContext()"]
    CTX --> GEM["Gemini Stream\nsystemPrompt + context\n+ userMessage"]
    GEM --> RESP["Response\nStreaming text\n+ agent badge"]
```

> **Guardian** (`web/src/lib/agents/guardian.ts`): cong pre-flight phan loai 8 category
> (product_catalog · revenue_bi · margin_cogs · staff_hr · customer_pii · internal_kb_other_dept ·
> system_internal · general) → policy theo role × department (`app_settings.access_policy`).
> admin/manager bo qua; FAIL-OPEN khi khong chac. Lark group: chi chan `system_internal`.
> Xem [[chatbot-agents-guardian|Chatbot Agents & Guardian]].

---

## Diagram 6 — 7 Phases Roadmap

```mermaid
timeline
    title GoHub Second Brain — 7 Phases

    section Done
        Phase 1 KB Foundation : Upload PDF/DOCX/MD
                              : Parse, Chunk, Embed
                              : pgvector semantic search
                              : Chatbot giai-dap dung KB
                              : (Done)

        Phase 2 Wiki : kb_wiki_pages + versions
                     : Web editor + preview
                     : Auto-embed khi save
                     : Search merge KB + Wiki
                     : (Done)

        Phase 4 MCP Server : POST /api/mcp JSON-RPC 2.0
                           : 9 tools cho Claude Code
                           : Auth Bearer MCP_SECRET
                           : (Done)

        Phase 5 NCC Processing : Upload WM/3HK Excel
                               : Parse, Diff, Confirm
                               : GoHub Standard Template
                               : (Done)

        Phase 6 Automation : Notification bell tren web
                           : Lark sync alert sau moi sync
                           : KB/Wiki auto-trigger notify
                           : (Done)

        Phase 7 RBAC : Department + role_permissions (Role x Report)
                     : KB/Wiki/Analytics filter theo quyen
                     : Guardian gate chatbot (role+dept+category)
                     : (Done)

    section Chua lam
        Phase 3 MRP : Upload → AI extract entities
                    : Generate plan (wiki pages to create/update)
                    : Human review → Approve/Reject
                    : Auto-create wiki pages
                    : (Chua lam)
```

---

## So Do Nhanh — Database Tables

```mermaid
erDiagram
    products ||--o{ skus : "has"
    skus ||--o{ listings : "has"
    listings ||--o{ items : "has"
    skus }o--|| ncc_worldmove : "vendor_product_id"

    products {
        text product_code PK
        text vendor_code
        text operator_code
        text supported_countries
        text telco_perks
    }

    skus {
        text sku_code PK
        text product_code FK
        text vendor_sku
        decimal latest_cogs
        text currency
        text status
    }

    ncc_worldmove {
        text vendor_product_id PK
        text vendor_code
        text product_name
        text region
        int days
        decimal data_gb
        bool is_unlimited
        decimal throttle_mbps
        decimal cost_price
        text apn
        text exist
    }

    ncc_datapool {
        text zone_id PK
        text vendor_code
        text zone_name
        text countries
        decimal price_per_gb
        text currency
    }

    kb_chunks {
        uuid id PK
        uuid document_id FK
        text content
        vector embedding
        text department
    }

    kb_wiki_pages {
        uuid id PK
        text title
        text content
        text page_type
        text department
        vector embedding
        int version
    }

    users {
        text username PK
        text role
        text lark_open_id
        text department
    }

    lark_chat_history {
        uuid id PK
        text open_id FK
        text thread_id
        text role
        text content
    }
```

---

## Ghi Chu Ky Thuat

| Thanh phan | Chi tiet |
|---|---|
| **Embedding model** | gemini-embedding-001 — 3072 dims |
| **Search** | pgvector exact cosine (khong index vi > 2000 dim limit) |
| **Cache TTL** | 30 phut — ref data + NCC catalog |
| **Chunk size** | 800 chars voi overlap |
| **Similarity threshold** | 0.4 (thap de bat nhieu ket qua) |
| **Top K** | 8 chunks per search |
| **Stream** | Gemini → ReadableStream → UI realtime |
| **Lark table** | Markdown table detect → Interactive Card + xlsx file |
| **Analytics DB** | `gohub_dw` — GCP Postgres LIVE (34.61.204.98), TÁCH BIỆT Supabase. BI Analyst query trực tiếp. |
| **Turso** | Chỉ còn config intel (partner_tiers đã migrate sang Supabase). Web KHÔNG query Turso cho analytics. |
| **Deploy** | Vercel Hobby — `gohub-intel.vercel.app`. Cron: `0 0 * * *` (Hobby limit 1/ngày). |
