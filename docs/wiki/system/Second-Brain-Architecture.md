---
title: "GoHub Second Brain — Kiến Trúc & Flow Diagram"
page_type: reference
department: tech
tags: [architecture, diagram, second-brain, flow, mermaid]
aliases: ["Second Brain Architecture", "System Diagram", "Flow Diagram"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# GoHub Second Brain — Kiến Trúc & Flow

---

## Diagram 1 — Tổng Quan Hệ Thống (Big Picture)

```mermaid
flowchart TB
    %% ===================== NGUỒN DỮ LIỆU =====================
    subgraph SRC ["📥  NGUỒN DỮ LIỆU"]
        direction LR
        A1["🔄 GoHub API\nProducts · SKUs\nListings · Items"]
        A2["📊 NCC Files\nWM Excel/CSV\n3HK Excel"]
        A3["📄 Documents\nPDF · DOCX · MD · TXT"]
        A4["✍️ Wiki Editor\nViết trực tiếp\ntrên web"]
        A5["💬 Lark Chat\nMessage history\ntheo thread"]
    end

    %% ===================== XỬ LÝ =====================
    subgraph PROC ["⚙️  XỬ LÝ"]
        direction LR
        B1["⏰ GitHub Actions\nSync daily 01:00 UTC\nsync.py → Supabase"]
        B2["📥 NCC Import\nParse → Diff\n→ Confirm\n✅ Phase 5"]
        B3["🧠 KB Pipeline\nParse → Chunk 800ch\n→ Embed 3072d\n✅ Phase 1"]
        B4["📝 Wiki Save\nEmbed + Version\nhistory\n✅ Phase 2"]
        B5["🤖 MRP Pipeline\nAI Map→Reduce\n→Plan→Commit\n🔜 Phase 3"]
    end

    %% ===================== LƯU TRỮ =====================
    subgraph DB ["🗄️  SUPABASE STORAGE"]
        direction LR
        C1[("📦 Core Data\nproducts · skus\nlistings · items\nsku_catalog")]
        C2[("🏷️ NCC Catalog\nncc_worldmove\n8,921 gói\nncc_3hk 45 zones\nncc_datapool")]
        C3[("📚 Knowledge Base\nkb_documents\nkb_chunks\npgvector 3072d")]
        C4[("📖 Wiki Pages\nkb_wiki_pages\nkb_wiki_versions\nversiond history")]
        C5[("💬 Chat & Users\nlark_chat_history\nconversations\nusers")]
        C6[("🌐 Reference\nref_countries 212\nref_support_countries 77\nref_vendors · app_settings")]
    end

    %% ===================== AI LAYER =====================
    subgraph AI ["🤖  AI LAYER  (Gemini gemini-3.5-flash)"]
        direction TB
        D_CACHE[("⚡ Reference Cache\n30 min TTL\nnccWm 8921 · countries\nvendors · groupMap")]
        D0["🔀 Router Agent\nRule-based fast path\n+ Gemini classifier fallback"]
        D1["🔍 Tư Vấn\nGoHub SKUs\n4-step country fallback"]
        D2["📋 Tra Cứu\nLookup mã\nCOGS + FX rates"]
        D3["💡 Giải Đáp\nKB + Wiki search\nThuật ngữ · quy trình"]
        D4["🔄 Gap Analysis\nNCC catalog\nWM exist Yes/No"]
    end

    %% ===================== MCP SERVER =====================
    subgraph MCP ["🔌  MCP SERVER  ✅ Phase 4"]
        E_MCP["9 Tools\nsearch_products · get_sku_detail\nsearch_ncc_catalog · search_kb\nget_fx_rates · get_promotions\nlist_vendors · decode_sku\nget_db_schema"]
    end

    %% ===================== TRUY CẬP =====================
    subgraph OUT ["🖥️  TRUY CẬP"]
        direction LR
        F1["🌐 Web Chatbot\ngohub-murex.vercel.app\n/chatbot"]
        F2["🐻 Lark Bot\nBé Gấu Thông Thái\np2p · group · thread"]
        F3["⚙️ Claude Code\n← MCP Server\ngohub tool calls"]
        F4["📊 Web UI Tabs\n/ncc · /kb · /kb#wiki\n/admin · /skus"]
    end

    %% ===================== CONNECTIONS =====================
    A1 -->|"batch 500/run"| B1 --> C1
    A2 -->|"admin/manager only"| B2 --> C2
    A3 -->|"max 10MB"| B3 --> C3
    A4 --> B4 --> C4
    A3 -.->|"Phase 3 🔜"| B5 -.-> C4
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
    actor User as 👤 User
    participant UI as 🖥️ Web/Lark
    participant Router as 🔀 Router
    participant Gemini_C as 🤖 Gemini Classifier
    participant Cache as ⚡ Cache (30m)
    participant DB as 🗄️ Supabase
    participant Agent as 🎯 Agent
    participant Gemini_G as ✨ Gemini Stream

    User->>UI: Nhập câu hỏi
    UI->>Router: POST /api/chat

    Note over Router: extractParams()<br/>Detect: country, days, GB,<br/>skuCodes, keywords

    alt Fast path — rule-based đủ
        Router->>Router: classifyAgent() rõ ràng
    else Không chắc
        Router->>Gemini_C: Classify intent
        Gemini_C-->>Router: agentId + params
    end

    Router->>Agent: buildToolContext(agentId, params)

    par Load ref data
        Agent->>Cache: supportCountries, nccWm, vendors
        Cache-->>Agent: Cached data (hoặc fetch Supabase nếu stale)
    and Load dynamic data
        Agent->>DB: searchSkus / getProductDetail<br/>searchKB / searchWiki / getFxRates
        DB-->>Agent: Query results
    end

    Agent->>Agent: Build context string<br/>(inject GoHub SKUs / NCC / KB / Wiki)

    Agent->>Gemini_G: systemPrompt + context + userMessage
    Gemini_G-->>UI: Stream text (từng token)
    UI-->>User: Hiển thị realtime

    Note over UI: Lark: detect markdown table?<br/>→ gửi Interactive Card + xlsx<br/>Web: render react-markdown + GFM
```

---

## Diagram 3 — NCC Import Pipeline (Upload → Confirm)

```mermaid
flowchart LR
    V["🏢 Vendor\ngửi file"] --> U["📤 Upload\nweb /ncc\nImport button"]

    U --> DET{"🔍 Auto-detect\nformat"}
    DET -->|"có cột wmproductId"| P1["📊 WM Native Parser\nCSV hoặc XLSX"]
    DET -->|"sheet 'Goi co san'\nhoặc cột vendor_code"| P2["📊 GoHub Standard\nParser"]

    P1 --> SHA{"🔐 SHA-256\ncheck"}
    P2 --> SHA
    SHA -->|"file đã import rồi"| WARN["⚠️ Cảnh báo\nfile không đổi"]
    SHA -->|"file mới"| CMP["🔄 Compare với DB"]

    CMP --> NEW["🟢 Sản phẩm mới\nvendor_id chưa có trong DB"]
    CMP --> CHG["🟡 Giá thay đổi\nCOGS khác nhau"]
    CMP --> DIS["🔴 Ngưng cung cấp\nactive trong DB\nnhưng không có trong file"]

    NEW & CHG & DIS --> UI_REV["📋 Review UI\nCollapsible sections\n5 mẫu đầu mỗi nhóm"]

    UI_REV -->|"❌ Cancel"| ABORT["Không làm gì"]
    UI_REV -->|"✅ Confirm Import"| UPSERT

    subgraph UPSERT ["💾 Upsert vào DB"]
        direction TB
        U1["INSERT / UPDATE\nncc_worldmove\nhoặc ncc_datapool"]
        U2["⚠️ Bảo toàn APN\napn · network_type\nproviders · coverage\nkhông bị overwrite"]
        U3["Mark inactive\nngưng cung cấp"]
        U1 --> U2
        U1 --> U3
    end

    UPSERT --> LOG["📝 Log\ndata_file_registry\nsha256 · row_count\nlast_imported · status=ok"]
    LOG --> DONE["✅ Done\nRefresh table"]

    style NEW fill:#dcfce7,stroke:#16a34a
    style CHG fill:#fef9c3,stroke:#ca8a04
    style DIS fill:#fee2e2,stroke:#dc2626
    style WARN fill:#fef3c7,stroke:#d97706
```

---

## Diagram 4 — Knowledge Base & Wiki Pipeline

```mermaid
flowchart TB
    subgraph INPUT ["📥 Đầu Vào"]
        direction LR
        F1["📄 Upload File\nPDF · DOCX · MD · TXT\nmax 10MB"]
        F2["✍️ Viết Wiki\nMarkdown editor\ntrên web /kb#wiki"]
    end

    subgraph KB_FLOW ["📚 KB Pipeline  (Phase 1 ✅)"]
        direction LR
        K1["📖 Parse\npdf-parse\nmammoth"] --> K2["✂️ Chunk\n800 chars\noverlap"] --> K3["🧮 Embed\ngemini-embedding-001\n3072 dims"] --> K4[("💾 kb_chunks\npgvector")]
    end

    subgraph WIKI_FLOW ["📖 Wiki Pipeline  (Phase 2 ✅)"]
        direction LR
        W1["💾 Save\nkb_wiki_pages"] --> W2["📜 Version\nkb_wiki_versions\n(lưu bản cũ)"] --> W3["🧮 Auto-embed\ntitle + content\n3072 dims"] --> W4[("💾 kb_wiki_pages\n+ embedding")]
    end

    subgraph MRP_FLOW ["🤖 MRP Pipeline  (Phase 3 🔜)"]
        direction LR
        M1["🔍 AI Map\nExtract entities\nvendor · products · dates"] --> M2["📝 AI Plan\nList actions\nwiki pages to create/update"] --> M3["👀 Human Review\nApprove / Reject\nper action"] --> M4["✅ Commit\nAuto-create/update\nwiki pages"]
    end

    subgraph SEARCH ["🔍 Search Layer"]
        direction LR
        S1["🧮 Embed query\ngemini-embedding-001"] --> S2["📊 Cosine similarity\nsupabase RPC\nsearch_kb"] --> S3["🏆 Top 8 results\nthreshold 0.4\nchunks + wiki merged"]
    end

    F1 --> KB_FLOW
    F2 --> WIKI_FLOW
    F1 -.->|"Phase 3 🔜"| MRP_FLOW -.-> WIKI_FLOW

    KB_FLOW & WIKI_FLOW --> SEARCH
    SEARCH --> BOT["🤖 Chatbot\ngiai-dap agent\nInject KB context"]

    style MRP_FLOW stroke-dasharray: 5 5,fill:#fefce8
```

---

## Diagram 5 — 4 Agents & Routing Logic

```mermaid
flowchart LR
    MSG["💬 User Message"] --> ROUTER["🔀 Router\nextractParams()"]

    ROUTER -->|"có country / từ khóa gói/eSIM"| TU_VAN
    ROUTER -->|"có mã SKU/Product/Item\nhoặc COGS/tỷ giá"| TRA_CUU
    ROUTER -->|"từ khóa nghĩa/giải thích\ncấu trúc/thuật ngữ"| GIAI_DAP
    ROUTER -->|"từ khóa NCC/gap/chưa có\nphân tích/so sánh ncc"| GAP

    subgraph TU_VAN ["🔍 Tư Vấn"]
        T1["searchSkus()\n4-step country fallback:\n1. Single country group\n2. Multi country group\n3. DB ilike query\n4. World/Global/Regional"]
    end

    subgraph TRA_CUU ["📋 Tra Cứu"]
        T2["identifyCode()\ngetProductDetail()\ngetItems()\nconvertCogs()\ngetFxRates()"]
    end

    subgraph GIAI_DAP ["💡 Giải Đáp"]
        T3["searchKB()\nsearchWiki()\ngetVendorInfo()\ndecodeSkuCode()"]
    end

    subgraph GAP ["🔄 Gap Analysis"]
        T4["findGaps()\nsearchNccWm()\nsearchNcc3hk()\nnccWmInSystem (exist=Yes)"]
    end

    TU_VAN & TRA_CUU & GIAI_DAP & GAP --> CTX["📄 Context String\nbuildToolContext()"]
    CTX --> GEM["✨ Gemini Stream\nsystemPrompt + context\n+ userMessage"]
    GEM --> RESP["📤 Response\nStreaming text\n+ agent badge"]
```

---

## Diagram 6 — 7 Phases Roadmap

```mermaid
timeline
    title GoHub Second Brain — 7 Phases

    section ✅ Hoàn thành
        Phase 1 KB Foundation : Upload PDF/DOCX/MD
                              : Parse → Chunk → Embed
                              : pgvector semantic search
                              : Chatbot giai-dap dùng KB

        Phase 2 Wiki : kb_wiki_pages + versions
                     : Web editor + preview
                     : Auto-embed khi save
                     : Search merge KB + Wiki

        Phase 4 MCP Server : POST /api/mcp JSON-RPC 2.0
                           : 9 tools cho Claude Code
                           : Auth Bearer MCP_SECRET

        Phase 5 NCC Processing : Upload WM/3HK Excel
                               : Parse → Diff → Confirm
                               : GoHub Standard Template

    section 🔜 Sắp làm
        Phase 3 MRP : Upload → AI extract entities
                    : Generate plan (wiki pages)
                    : Human review → Approve
                    : Auto-create wiki pages

        Phase 6 Automation : Daily sync alert qua Lark
                           : Weekly digest thứ Hai
                           : NCC import → notify team

        Phase 7 RBAC : Department column cho users
                     : KB/Wiki filter theo department
                     : Global scope cho all
```

---

## Sơ Đồ Nhanh — Database Tables

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

## Ghi Chú Kỹ Thuật

| Thành phần | Chi tiết |
|---|---|
| **Embedding model** | `gemini-embedding-001` — 3072 dims |
| **Search** | pgvector exact cosine (không index vì > 2000 dim limit) |
| **Cache TTL** | 30 phút — ref data + NCC catalog |
| **Chunk size** | 800 chars với overlap |
| **Similarity threshold** | 0.4 (thấp để bắt nhiều kết quả) |
| **Top K** | 8 chunks per search |
| **Stream** | Gemini → ReadableStream → UI realtime |
| **Lark table** | Markdown table detect → Interactive Card + xlsx file |

---

## Liên Quan

- [[HOME|Wiki Home]]
- [[company/GoHub-Overview|Tổng quan công ty]]
- [[processes/Import-NCC|Quy trình Import NCC]]
- [[vendors/WM-WorldMove|WorldMove Vendor Profile]]
- [[vendors/3HK|3HK Vendor Profile]]
