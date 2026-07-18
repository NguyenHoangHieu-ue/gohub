# GoHub — Product Management & Business Intelligence Platform

> Hệ thống quản lý sản phẩm, phân tích kinh doanh và AI chatbot tích hợp cho GoHub.

---

## I. TỔNG QUAN HỆ THỐNG

GoHub Intel (Intelligence Hub) là nền tảng quản trị nội bộ hợp nhất toàn diện 3 mảnh ghép chính:
1. **Product Management (GoHub PM)**: Quản lý toàn bộ vòng đời sản phẩm bao gồm Catalog SIM/eSIM hệ thống (Products, SKUs, Listings, Items), danh mục đối tác/Nhà cung cấp (WorldMove, 3HK, v.v.), nhóm địa lý và Cơ sở tri thức (Knowledge Base).
2. **Business Intelligence (gohub-intel)**: Phân tích sâu số liệu doanh thu, chi phí, đơn hàng, khách hàng sỉ B2B, bán lẻ B2C trực tiếp từ kho dữ liệu tập trung (`gohub_dw`) với giao diện chuyên nghiệp và trực quan.
3. **AI Chatbot (Bé Gấu Thông Thái)**: Hệ thống AI đa tác nhân (7 chuyên gia Agents) hỗ trợ tư vấn gói cước, giải đáp nghiệp vụ, phân tích Gap NCC, truy vấn SQL thực thi số liệu trực tiếp, truy xuất dữ liệu thô toàn hệ thống và xuất dữ liệu báo cáo sang tệp tin mẫu.

---

## II. CÔNG NGHỆ ÁP DỤNG (STACK)

| Layer | Công nghệ | Chi tiết sử dụng |
|---|---|---|
| **Frontend** | Next.js 14 (App Router, TS, Tailwind CSS) | Toàn bộ giao diện quản trị và báo cáo BI |
| **Deploy** | Vercel (Auto-deploy từ branch `main`) | Đảm bảo tính sẵn sàng cao |
| **Auth** | NextAuth.js v4 + Bcrypt + Lark OAuth | Bảo mật danh tính đa kênh |
| **Product DB** | Supabase (PostgreSQL + pgvector) | Lưu trữ Catalog sản phẩm, Wiki, CS tickets |
| **Analytics DB** | PostgreSQL `gohub_dw` | Kho dữ liệu kinh doanh tập trung (Doanh thu, lưu lượng) |
| **Caching Layer** | L2 Shared Caching (Migration v20) | In-memory L1 (5 phút) + Supabase L2 (10 phút) |
| **AI LLM** | Google Gemini (gemini-3.5-flash / embedding) | Xử lý Chatbot, Classifier và Vector Search |
| **Bot Channel** | Lark Bot API (`lib/lark.ts`) | Đọc/bắn thông tin báo cáo và hội thoại đa kênh |
| **Sync Engine** | GitHub Actions Cron | Tự động chạy tiến trình đồng bộ hàng ngày |

---

## III. CẤU TRÚC THƯ MỤC CHUẨN HÓA (RESTRUCTURED REPO LAYOUT)

Dự án đã được quy hoạch gọn gàng, bảo mật và chuẩn hóa toàn bộ cấu trúc thư mục như sau:

```
HeThong/ (Root)
├── .github/                  # Cấu hình GitHub (Workflows CI/CD, Issue/PR templates)
│   └── workflows/
│       ├── sync.yml          # Đồng bộ catalog sản phẩm hàng ngày (01:00 UTC)
│       ├── data_sync.yml     # Đồng bộ dữ liệu tham chiếu (02:00 UTC)
│       └── neo4j_sync.yml    # Đồng bộ đồ thị tri thức ngữ nghĩa
├── .ai/                      # Gom các file hướng dẫn quy tắc AI vào đây (đã chuyển từ _Skills_AI)
│   ├── RULES.md              # Quy tắc quản lý file tri thức
│   ├── CLAUDE.md             # Quy tắc tư duy lập trình cho AI
│   ├── FESkill.md            # Chỉ dẫn UX/UI "Anti-Slop" chất lượng cao
│   └── agents/AGENTS.md      # Tài liệu thiết kế 7 agents chatbot
├── web/                      # Ứng dụng Next.js (Mã nguồn Web Frontend & Backend API)
│   ├── src/
│   │   ├── app/              # App Router Pages & API Routes
│   │   ├── components/       # Các React components tái sử dụng
│   │   ├── lib/              # Core business logic, Clients (Supabase, DW, Lark), AI Engine
│   │   └── types/            # Khai báo kiểu dữ liệu TypeScript (dừng các lỗi tsc compile)
│   └── package.json
├── backend/                  # Đã quy hoạch toàn bộ kịch bản Python & Database quản lý tập trung
│   ├── data_sync/            # Các kịch bản Python đồng bộ tự động (Gom từ sync/ và database/)
│   │   ├── sync.py
│   │   ├── gohub_api_clients.py
│   │   └── populate_geo_hierarchy.py
│   ├── migrations/           # PostgreSQL/Supabase Migrations v1 -> v20
│   └── seeding/              # Các script nạp dữ liệu một lần (Gom từ database/import/)
├── docs/                     # ⚠️ CHỈ commit docs/wiki/** — file rời khác là LOCAL-ONLY (gitignore)
│   ├── wiki/                 # Obsidian Wiki nội bộ (nguồn duy nhất được commit trong docs/)
│   │   ├── Tab/              # Tài liệu chi tiết kỹ thuật của 28 Tab hệ thống
│   │   ├── system/           # Kiến trúc: Chatbot-Agents-Guardian, Second-Brain...
│   │   ├── company/ · pricing/ · products/ · ...
│   │   └── (đồng bộ Supabase kb_wiki_pages qua script upsert theo title)
│   ├── session_summary.txt   # (LOCAL-ONLY) Nhật ký session làm việc của AI
│   └── MoTaChiTiet.md        # (LOCAL-ONLY) Bối cảnh nghiệp vụ công ty
├── resources/                # Đã quy hoạch toàn bộ Excel/báo giá nhạy cảm để dọn rác root
│   ├── reference/            # Gom từ Data/ (countries, support-countries, tỉ giá nội bộ)
│   ├── company_templates/    # Gom từ TaiLieuCongTy_Chung/ (COGS_Template, Quy trình)
│   ├── vendor_catalogs/      # Gom từ VENDOR/ (Báo giá 3HK, eSIM apn...)
│   └── product_templates/    # Gom từ Add_product/ (WM_Taiwan_unlimited...)
├── Bug.txt                   # (LOCAL-ONLY, gitignore) Nhật ký lỗi hệ thống
├── WORK.md                   # (LOCAL-ONLY, gitignore) Trạng thái dự án & Roadmap
└── README.md                 # Tệp giới thiệu & Hướng dẫn khởi chạy hệ thống
```

> **Quy tắc commit (s106):** KHÔNG commit `Bug.txt`, `WORK.md`, `new_info.txt`, `test.sql`, hay file `.md/.txt` rời lên GitHub. Trong `docs/` chỉ `docs/wiki/**` được commit — mọi tài liệu làm việc còn lại giữ LOCAL (đã cấu hình `.gitignore`).

---

## V. ĐỀ XUẤT QUY TRÌNH VẬN HÀNH CHUẨN (AUTOMATION, QA & CI/CD WORKFLOW)

Để hướng tới việc tự động hóa quy trình, đảm bảo an toàn bảo mật, hạn chế tối đa lỗi phát sinh sau khi deploy và tránh việc "sửa đổi thủ công từng chút", đề xuất áp dụng **Quy trình chuẩn hóa 4 lớp** dưới đây:

```
[Local Code] ─► [Pre-Commit Hooks] ─► [GitHub Pull Request (CI)] ─► [Staging Deploy & QA] ─► [Production Deploy]
                     (Secret Scan)           (Build, Lint, Unit Test)      (Playwright, DB verify)
```

### 1. Quy trình Code & Tiêu chuẩn Bảo mật (Development & Security)
- **Cơ chế phân nhánh (Branching Strategy)**:
  - Tuyệt đối không code trực tiếp trên nhánh `main`.
  - Quy hoạch 3 nhánh chính:
    - `main`: Nhánh chạy Production ổn định nhất.
    - `staging`: Nhánh thử nghiệm tích hợp trước khi release.
    - `feature/*` hoặc `bugfix/*`: Nhánh phát triển của lập trình viên.
- **Pre-commit Hooks (Kiểm tra trước khi commit)**:
  - Cài đặt `husky` và `lint-staged` trong dự án.
  - Sử dụng công cụ quét bí mật tự động (như `gitleaks` hoặc `secret-lint`) ở bước pre-commit để ngăn chặn việc vô tình commit nhầm API key, token Lark, hay mật khẩu Supabase lên GitHub.
- **Biến môi trường (Environment Variables)**:
  - Nghiêm cấm đặt credentials vào bất kỳ tệp tài liệu `.txt` hay `.md` nào.
  - Sử dụng file `.env.local` tại máy cá nhân (đã đưa vào `.gitignore`). Cấu hình khóa trên Vercel cho từng môi trường riêng biệt (Staging vs Production).

### 2. Quy trình Kiểm thử Tự động (Automated QA & Testing)
Để loại bỏ lỗi phát sinh lúc runtime, cần xây dựng bộ test suite bao gồm:
- **Unit Tests (Kiểm thử đơn vị)**:
  - Sử dụng `Vitest` hoặc `Jest` để kiểm tra các hàm tiện ích nghiệp vụ lõi như: `stripSuperlativeNhat()` (xử lý đồng âm), `wordMatch()` (nhận diện quốc gia), `convertCogs()` (quy đổi giá vốn), `decodeSkuCode()`.
- **Integration Tests (Kiểm thử tích hợp)**:
  - Kiểm tra các đầu API (/api/chat, /api/analytics/*).
  - Tự động hóa việc gửi yêu cầu mẫu tới AI Router tại `/api/chat` để xác nhận AI Classifier phân loại đúng Intent và phân vùng nguồn dữ liệu (`gohub_system` vs `ncc_catalog`) trước khi merge.
- **End-to-End (E2E) Testing (Kiểm thử thực tế đầu-cuối)**:
  - Cấu hình thư viện `Playwright` để tự động hóa kịch bản người dùng: *Đăng nhập -> Click xem biểu đồ BOD Report (xác nhận không lỗi NaN) -> Mở Chatbot hỏi đáp số liệu -> Xác nhận ChatChart render Recharts thành công*.
- **Database Smoke Tests (Kiểm thử tính tương thích Database)**:
  - Một script chạy ngầm tự động quét qua 18 truy vấn SQL BI để kiểm tra xem cấu trúc bảng trong kho dữ liệu `gohub_dw` có bị thay đổi (break) hay không trước khi tiến hành deploy.

### 3. Quy trình Tích hợp & Triển khai liên tục (CI/CD Pipeline)
Sử dụng GitHub Actions để tự động hóa toàn bộ quá trình:
- **Pipeline chạy tự động khi tạo Pull Request (PR)**:
  1. **Lint & Type-Check Stage**: Chạy lệnh `npm run lint` và `tsc --noEmit` để đảm bảo code sạch lỗi linter và khớp kiểu dữ liệu TypeScript 100%. Nếu có lỗi TypeScript, chặn không cho Merge.
  2. **Test Stage**: Chạy các Unit test và Integration test tự động trên môi trường ảo hóa Ubuntu headless.
- **Triển khai tự động (Continuous Deployment)**:
  1. **Deploy Staging**: Khi PR được duyệt và merge vào nhánh `staging`, Vercel tự động triển khai bản thử nghiệm lên môi trường Staging. Đội ngũ QA/Quản trị viên thực hiện kiểm thử thực tế trên link Staging.
  2. **Deploy Production**: Sau khi Staging hoạt động ổn định, tiến hành merge `staging` sang `main`. Vercel tự động deploy lên môi trường Production thực tế (`gohub-intel.vercel.app`).

### 4. Quy trình Quản trị Database & Giám sát Đồng bộ
- **Quản lý Schema Migrations**:
  - Không chạy lệnh SQL can thiệp thủ công (DDL) trực tiếp trên cơ sở dữ liệu Production.
  - Mọi thay đổi cấu trúc bảng bắt buộc phải viết thành file migration sql (ví dụ `v21_new_feature.sql`) và lưu trữ trong `database/migrations/`. File này sẽ được áp dụng tự động qua GitHub Actions CI/CD khi deploy.
- **Hệ thống Giám sát & Cảnh báo Đồng bộ hàng ngày (Sync Monitoring)**:
  - Các cron jobs đồng bộ dữ liệu (`sync.yml`, `data_sync.yml`) sau khi chạy thành công hoặc gặp lỗi bắt buộc phải bắn thông điệp tóm tắt chi tiết (gồm số dòng cập nhật, thời gian thực thi, lỗi phát sinh nếu có) vào nhóm chat Vận hành trên Lark Chat (`Bé Gấu Thông Thái` gửi thông báo) để đội ngũ Tech nắm bắt tức thì và khắc phục ngay trong ngày.

---

## VI. AI AGENT SYSTEM (7 AGENTS CHUYÊN BIỆT)

Hệ thống Chatbot tích hợp **7 Agent chuyên gia** (đã E2E tested + audit LLM-judge s106):

| Tên Agent | ID Tác nhân | Phạm vi / Chức năng | Trigger đặc trưng |
|---|---|---|---|
| **Tư Vấn** | `tu-van` | Tư vấn SIM/eSIM theo nước/ngày/GB từ `sku_catalog`; hỗ trợ **gói đa quốc gia** (phủ nhiều nước cùng lúc) | "đi Thái 5 ngày", "gói Japan", "cả Malaysia và Singapore" |
| **Tra Cứu** | `tra-cuu` | Tra cứu chi tiết thông số SKU, Product Code, giá vốn, tỷ giá | Mã SKU (13 ký tự), mã Product, COGS |
| **Giải Đáp** | `giai-dap` | Giải thích quy trình, thuật ngữ, cấu trúc mã, chỉ số kinh doanh (CM1…), tìm kiếm Wiki/KB | "KYC là gì", "CM1 khác gì Gross Profit" |
| **NCC & Gap** | `gap-analysis` | Duyệt catalog đối tác WM/3HK, so sánh và phân tích Gap hệ thống | "so sánh NCC", "WM có gói nào chưa tạo" |
| **BI Analyst** | `bi-analyst` | Tự động sinh SQL truy vấn `gohub_dw` (doanh thu/kho/nhân viên/CM1) + biểu đồ; **rào PII** (chỉ trả mã KH) | "doanh thu", "báo cáo 3HK trong kho Hà Nội", "khách mua nhiều nhất" |
| **Kho Dữ Liệu** | `data-explorer` | Truy xuất DỮ LIỆU THÔ toàn hệ thống: `executeSQL` (gohub_dw) + `querySupabase` (38 bảng catalog/config) | "có bao nhiêu SKU active", "liệt kê wiki", "đếm sản phẩm theo vendor" |
| **Tạo Template** | `tao-template` | Xuất Excel template sản phẩm từ NCC cho Admin/Manager | "tạo template WM", "template 3hk" |

> **Kiểm thử agent (s106)**: bộ E2E `web/src/__e2e__/agent-audit` (đối chiếu prompt vs DB thật) + `agent-grade` (LLM-judge chấm chất lượng câu trả lời) — chạy qua `vitest.audit.config.ts`. Regression routing: `chatbot-routing.test.ts`. Chi tiết: `docs/wiki/system/Chatbot-Agents-Guardian.md`.

---

## VII. DANH SÁCH BÁO CÁO BI (ANALYTICS) & CHẾ ĐỘ PHÂN QUYỀN

Bảng phân phối 18 trang báo cáo BI được đồng bộ bảo mật thông qua ma trận **Role × Report**:

| STT | Trang báo cáo | ID Báo cáo | Nguồn dữ liệu chính | Vai trò truy cập nền mặc định |
|---|---|---|---|---|
| 1 | **Dashboard** | `dashboard` | `gohub_dw` | Admin, Creator, Manager, BOD, Staff |
| 2 | **BOD Report** | `bod` | `gohub_dw` (Doanh thu + COGS + Chi phí) | Admin, Creator, BOD, Manager |
| 3 | **All-Time Report** | `all-time` | `gohub_dw` (Dữ liệu lịch sử đa năm) | Admin, Creator, Manager, BOD, Staff |
| 4 | **Channels** | `channels` | `gohub_dw` + Cấu hình Phí sàn | Admin, Creator, Manager, BOD, Staff |
| 5 | **B2B Performance** | `b2b` | `gohub_dw` + Partner Tiers | Admin, Creator, BOD, Manager, Staff |
| 6 | **B2C Performance** | `b2c` | `gohub_dw` + Chatwoot + Turso Spend | Admin, Creator, Manager, BOD, Staff |
| 7 | **Website Analytics** | `website` | Google Analytics 4 + Search Console | Admin, Creator, Manager, BOD, Staff |
| 8 | **Staff** | `staff` | `gohub_dw` (Leaderboard, gán NaN) | Admin, Creator, Manager, BOD, Staff |
| 9 | **Customers** | `customers` | `gohub_dw` (Phân tích khách hàng sỉ B2B) | Admin, Creator, Manager, BOD, Staff |
| 10 | **Vendors** | `vendors` | `gohub_dw` (Hiệu suất nhà cung cấp) | Admin, Creator, Manager, BOD, Staff |
| 11 | **Orders** | `orders` | `gohub_dw` (Quản lý và xuất đơn hàng) | Admin, Creator, Manager, BOD, Staff |
| 12 | **Fulfillment** | `fulfillment`| `gohub_dw` (Tốc độ và chất lượng gửi sim) | Admin, Creator, Manager, BOD, Staff |
| 13 | **3HK Data Usage** | `3hk-usage` | `gohub_dw` (fact_data_usage 3HK) | Admin, Creator, Manager, BOD, Staff |
| 14 | **CS Troubleshoot**| `cs-troubleshoot`| Supabase `lark_cs_tickets` (24,712 rows) | Admin, Creator, Manager, BOD, Staff |
| 15 | **Feedback** | `feedback` | Supabase `feedbacks` (Thu thập ý kiến) | Tất cả các vai trò (Gửi phản hồi) |
| 16 | **Products (BI)** | `products` | `gohub_dw` (Doanh số bán theo SKU) | Admin, Creator, Manager, BOD, Staff |
| 17 | **KPI / Target** | `targets` | Supabase `analytics_target_planning` | Admin, Creator, Manager, BOD, Staff |
| 18 | **SQL Explorer** | `sql` | `gohub_dw` (Truy vấn SELECT trực tiếp) | Admin, Creator |
| 19 | **Scheduled Msgs** | `scheduled` | Supabase `lark_scheduled_messages` | Admin, Creator |

*Cơ chế phân quyền Sidebar*: Sidebar hiển thị các tab dựa trên công thức:
$$\\text{Quyền thực tế} = \\text{Quyền nền của Role} \\cup \\text{Quyền cấp riêng cho tài khoản (allowed\\_analytics / allowed\\_tabs)}$$

---

## VIII. HƯỚNG DẪN CÀI ĐẶT LOCAL

1. **Khởi chạy ứng dụng Web (Next.js)**:
   ```bash
   cd web
   npm install
   cp .env.local.example .env.local  # Cấu hình các biến môi trường nhạy cảm
   npm run dev
   ```
2. **Khởi chạy kịch bản đồng bộ dữ liệu**:
   ```bash
   # Tạo môi trường ảo hóa Python
   python -m venv venv_phase1
   venv_phase1\\Scripts\\activate   # Trên Windows
   pip install -r requirements.txt # Cài đặt thư viện cần thiết
   python sync/sync.py             # Kích hoạt đồng bộ sản phẩm thủ công
   ```
