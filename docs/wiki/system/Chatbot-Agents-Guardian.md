---
title: "Chatbot Agents & Guardian"
page_type: reference
department: tech
tags: [chatbot, agent, guardian, rbac, permission, ai]
aliases: ["Guardian", "Chatbot Agents", "Phân quyền chatbot", "Agent Routing"]
created: 2026-06-21
updated: 2026-06-25
status: active
---

# Chatbot Agents & Guardian

Chatbot GoHub dùng kiến trúc **multi-agent**: 1 router phân loại câu hỏi → chọn đúng 1 trong **7 agent** chuyên trách. Trước khi gọi agent, **Guardian** kiểm soát quyền hạn câu hỏi (vượt quyền / khác phòng ban → từ chối lịch sự).

> Sơ đồ luồng: [[system/Second-Brain-Architecture#Diagram 5 — 6 Agents + Guardian & Routing Logic|Diagram 5]]

---

## 7 Agent chuyên trách

| Agent | ID | Vai trò | Nguồn dữ liệu |
|---|---|---|---|
| **Tư Vấn** | `tu-van` | Tìm/đề xuất gói SIM/eSIM GoHub theo nước/khu vực/ngày/GB | skus + sku_catalog (4-step country fallback) |
| **Tra Cứu** | `tra-cuu` | Tra mã cụ thể (SKU/Product/Item/Listing), COGS, tỷ giá | products/skus/items + FX |
| **Giải Đáp** | `giai-dap` | Giải thích thuật ngữ, cấu trúc mã, chính sách, mã nhóm nước | KB + Wiki + vendor info |
| **NCC & Gap** | `gap-analysis` | Chủ sở hữu catalog NCC (WM/3HK); browse + so sánh gap với hệ thống | ncc_worldmove · ncc_3hk |
| **Tạo Template** | `tao-template` | Xuất file Excel template sản phẩm từ catalog WM/3HK | catalog NCC theo nước |
| **BI Analyst** (Bé Gấu Bi-Ai) | `bi-analyst` | Phân tích kinh doanh: doanh thu, đơn hàng, nhân viên, B2B/B2C, top SKU, traffic website, SEO | `executeSQL` → gohub_dw (GCP Postgres) · `queryGA4` → Google Analytics 4 · `queryGSC` → Search Console |
| **Kho Dữ Liệu** (🗄️, s95) | `data-explorer` | Truy xuất DỮ LIỆU THÔ toàn hệ thống — đếm/liệt kê/tra bảng nhanh | `executeSQL` gohub_dw + `querySupabase` (38 bảng catalog/config) + `listSupabaseTables` |

### Router (định tuyến)
- `web/src/lib/agents/router.ts`: `extractParams()` (nước/khu vực/mã/vendor...) + Gemini classifier (`classifier.ts`).
- **Override xác định** (thắng classifier khi hay nhầm): tạo/xuất template → `tao-template`; mã nhóm + "là gì/gồm nước nào" → `giai-dap`; doanh thu/nhân viên/top bán chạy (không có nước) → `bi-analyst`.
- **Bước hỏi lại**: câu quá mơ hồ (thiếu nước/khu vực/mã) → hỏi lại ngay, không gọi Gemini.

---

## Guardian — cổng kiểm soát quyền hạn

`web/src/lib/agents/guardian.ts` · `guardCheck(message, role, department, opts?)` → `{ allowed, reason, category }`.

Chạy **song song** với router (zero thêm độ trễ). Nếu chặn → stream từ chối lịch sự (badge "Hạn chế quyền"), **không** gọi agent.

### 8 category + policy mặc định (role) — **NỚI TỐI ĐA (cập nhật s107)**

> Triết lý: hầu hết mọi người hỏi được **mọi thứ** (sản phẩm, doanh thu/đơn/kênh, khách hàng, tài liệu). CHỈ chặn 3 nhóm thật sự nhạy cảm.

| Category | admin/creator | bod | manager | staff & phòng ban |
|---|---|---|---|---|
| product_catalog / general | ✅ | ✅ | ✅ | ✅ |
| revenue_bi (doanh thu/đơn/kênh) | ✅ | ✅ | ✅ | ✅ |
| customer_pii (list/SĐT khách) | ✅ | ✅ | ✅ | ✅ *(PII tên/SĐT/email luôn che ở tầng prompt — chỉ trả mã KH)* |
| internal_kb_other_dept (tài liệu/quy trình nghiệp vụ) | ✅ | ✅ | ✅ | ✅ |
| **margin_cogs** (giá vốn/GP/CM1) | ✅ | ✅ | ✅ | ❌ |
| **staff_hr** (lương/hiệu suất NV) | ✅ | ✅ | ✅ | ❌ *(+hr: ✅)* |
| **system_internal** (code / cách hệ thống-chatbot **build** / stack-deploy-kiến trúc / quy trình **kỹ thuật** / credential / schema) | ✅ | ❌ | ❌ | ❌ |

> **GIỚI HẠN CHÍNH = system_internal.** Bắt cả "hệ thống/chatbot được build như nào", "dùng công nghệ/stack gì", "deploy ra sao", "kiến trúc/CI-CD".
> ⚠️ **Phân biệt:** quy trình **NGHIỆP VỤ** (KYC, quy trình tạo SP/SKU, xử lý đơn, chính sách giá) **KHÔNG** phải system_internal → ĐƯỢC PHÉP trả lời. Chỉ "quy trình" mang tính code/kỹ thuật/build hệ thống mới chặn.
>
> **Giá B2B vs B2C:** không xử lý ở guardian — scope qua `getChannelFromRole(role)` và CHỈ ảnh hưởng **giá bán sản phẩm** (agent tra-cuu/tu-van): role `b2c`/`saleb2c`→B2C, `b2b`→B2B, role khác→thấy tất cả. Số liệu doanh thu BI không giới hạn theo kênh.

- Policy lưu ở `app_settings.access_policy` (admin chỉnh qua **Admin → Cài đặt → Quyền hạn câu hỏi Chatbot**). Thiếu cấu hình → dùng default trên. ⚠️ Nếu đã lưu policy cũ, `loadPolicy` MERGE parsed đè DEFAULT theo TỪNG Ô → muốn áp bản NỚI mới hoàn toàn thì reset access_policy.
- **admin/creator**: bỏ qua hẳn (không tốn call phân loại).
- **FAIL-OPEN**: nếu phân loại lỗi / không chắc (confidence < 0.6) → cho qua, tránh chặn nhầm câu hợp lệ.

### Lark group
Lark dùng trong group → không phân biệt được role (mọi người có thể là `standard`). Guardian ở Lark chạy chế độ riêng: `{ onlyCategories: ["system_internal"], ignoreRole: true }` — **chỉ chặn câu hỏi nội bộ hệ thống** (bot hoạt động thế nào / workflow / code / prompt / schema) → trả lời "bạn hỏi trực tiếp Hiếu nhé 😊". Nghiệp vụ (sản phẩm/doanh thu...) vẫn trả lời bình thường.

### Tránh chồng chéo
- `role_filters` (BI): lọc **row** dữ liệu trong SQL của BI Analyst theo role.
- `DISPLAY_RULES` (prompt agent): nhắc agent tự từ chối code/prompt nội bộ.
- **Guardian**: lấp gap ở mức **category + dept + intent**, chặn xác định trước khi gọi agent.

---

## Lưu ý kỹ thuật
- Model `gemini-3.5-flash` là **thinking model**: phải set `generationConfig.thinkingConfig.thinkingBudget = 0` mới trả JSON ổn định (nếu không, token bị tiêu vào "thinking" → output cụt → JSON.parse lỗi).
- **Lark bot trên Vercel/Netlify**: KHÔNG dùng `waitUntil` (không hỗ trợ trên Next 14 App Router). Xử lý **đồng bộ** (await rồi mới trả 200). Chống Lark retry: dedup `event_id` qua `app_settings.larkevt:<id>`. Câu hỏi BI dài (>10s) có thể bị Vercel Free timeout.
- Liên quan: [[system/Second-Brain-Architecture]] · [[vendors/WM-WorldMove]] · [[vendors/3HK]]

---

## Test harness đánh giá agent (session tối ưu 7 agent — 2026-07-18)

Bộ E2E kiểm chất lượng **câu trả lời** (không chỉ routing), chạy DB + Gemini thật:
- `web/src/__e2e__/agent-audit.test.ts` — introspect gohub_dw (13 bảng) + probe 38 bảng Supabase, đối chiếu kiến thức trong prompt vs DB thật (phát hiện bảng agent chưa biết / catalog lệch).
- `web/src/__e2e__/agent-grade.test.ts` + `agent-banks.ts` — bank câu hỏi/agent, chạy `answerQuestion()` rồi **LLM-judge** (Gemini chấm rubric must/mustNot). Chọn agent: `GRADE_AGENT="bi-analyst"` hoặc `"a,b,c"` hoặc `"all"`. Chạy song song pool 3.
- `web/src/lib/agents/answer.ts` — `answerQuestion()`: pipeline non-stream dùng CHUNG, mirror `/api/chat` (route→guardian→clarify→context→agent) để test bám code thật.
- Config: `vitest.audit.config.ts`. Regression routing: `chatbot-routing.test.ts` (32 câu, 32/32).
- Chạy: `npx vitest run --config vitest.audit.config.ts src/__e2e__/agent-grade.test.ts --disableConsoleIntercept`

### Lỗi đã sửa qua audit
- **bi-analyst**: (1) rào PII — chỉ trả `customer_code`, KHÔNG tên/SĐT/email khách (trước bị leak "Anh Công…"); (2) glossary chỉ số — CM1 = GP − Operation Cost, mà Operation Cost KHÔNG có trong gohub_dw → không đánh đồng CM1 = Gross Profit; (3) cảnh báo bảng mirror `fact_fulfilment_revenue_power_bi` (1 chữ "l") KHÔNG dùng (đếm trùng); (4) fallback chống câu trả lời rỗng khi Gemini kết thúc function-calling không sinh text; (5) `theo kho`/`contribution` route đúng bi-analyst.
- **data-explorer**: catalog Supabase 0 drift; hướng dẫn "đếm theo nhóm" (querySupabase KHÔNG có GROUP BY → countOnly từng nhóm); routing "liệt kê wiki" / "đếm item" → data-explorer.
- **giai-dap**: thêm glossary chỉ số kinh doanh (Revenue/GP/GPM/CM1/CM1%/3HK Contribution).
- **tu-van**: nêu tên nước lạ (ngoài danh mục, vd Monaco) → báo "chưa có" thay vì hỏi lại; extractParams tự bắt loại SIM (sim vật lý/eSIM). **Multi-country**: "gói dùng được ở CẢ Malaysia VÀ Singapore" → `searchSkusMultiCountry` giao tập nhóm nước phủ ĐỒNG THỜI mọi nước (extractParams gom `countries[]` khi có "cả…và / đồng thời / cùng lúc"; tránh nhầm "so sánh Nhật và Hàn"). GoHub CÓ ~21 nhóm phủ cả Malaysia+Singapore (AP2/APA…).
- **Router**: `GAP_KEYWORD` thêm word-boundary (tránh `3hk co` khớp "3hk **co**ntribution"); chặn BI override cướp câu NCC/gap.

### Grade cuối (2026-07-18): 7/7 con đạt full — bi-analyst 13/13 · data-explorer 8/9(1 niche) · tu-van 7/7 · giai-dap 6/6 · tra-cuu 5/5 · gap-analysis 5/5 · tao-template 3/3.
