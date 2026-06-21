---
title: "Chatbot Agents & Guardian"
page_type: reference
department: tech
tags: [chatbot, agent, guardian, rbac, permission, ai]
aliases: ["Guardian", "Chatbot Agents", "Phân quyền chatbot", "Agent Routing"]
created: 2026-06-21
updated: 2026-06-21
status: active
---

# Chatbot Agents & Guardian

Chatbot GoHub dùng kiến trúc **multi-agent**: 1 router phân loại câu hỏi → chọn đúng 1 trong **6 agent** chuyên trách. Trước khi gọi agent, **Guardian** kiểm soát quyền hạn câu hỏi (vượt quyền / khác phòng ban → từ chối lịch sự).

> Sơ đồ luồng: [[system/Second-Brain-Architecture#Diagram 5 — 6 Agents + Guardian & Routing Logic|Diagram 5]]

---

## 6 Agent chuyên trách

| Agent | ID | Vai trò | Nguồn dữ liệu |
|---|---|---|---|
| **Tư Vấn** | `tu-van` | Tìm/đề xuất gói SIM/eSIM GoHub theo nước/khu vực/ngày/GB | skus + sku_catalog (4-step country fallback) |
| **Tra Cứu** | `tra-cuu` | Tra mã cụ thể (SKU/Product/Item/Listing), COGS, tỷ giá | products/skus/items + FX |
| **Giải Đáp** | `giai-dap` | Giải thích thuật ngữ, cấu trúc mã, chính sách, mã nhóm nước | KB + Wiki + vendor info |
| **NCC & Gap** | `gap-analysis` | Chủ sở hữu catalog NCC (WM/3HK); browse + so sánh gap với hệ thống | ncc_worldmove · ncc_3hk |
| **Tạo Template** | `tao-template` | Xuất file Excel template sản phẩm từ catalog WM/3HK | catalog NCC theo nước |
| **BI Analyst** (Bé Gấu Bi-Ai) | `bi-analyst` | Phân tích kinh doanh: doanh thu, đơn hàng, nhân viên, B2B/B2C, top SKU | function-calling SQL trên `gohub_dw` + role_filters |

### Router (định tuyến)
- `web/src/lib/agents/router.ts`: `extractParams()` (nước/khu vực/mã/vendor...) + Gemini classifier (`classifier.ts`).
- **Override xác định** (thắng classifier khi hay nhầm): tạo/xuất template → `tao-template`; mã nhóm + "là gì/gồm nước nào" → `giai-dap`; doanh thu/nhân viên/top bán chạy (không có nước) → `bi-analyst`.
- **Bước hỏi lại**: câu quá mơ hồ (thiếu nước/khu vực/mã) → hỏi lại ngay, không gọi Gemini.

---

## Guardian — cổng kiểm soát quyền hạn

`web/src/lib/agents/guardian.ts` · `guardCheck(message, role, department, opts?)` → `{ allowed, reason, category }`.

Chạy **song song** với router (zero thêm độ trễ). Nếu chặn → stream từ chối lịch sự (badge "Hạn chế quyền"), **không** gọi agent.

### 8 category + policy mặc định (role)

| Category | admin/manager | bod | staff | standard |
|---|---|---|---|---|
| product_catalog / general | ✅ | ✅ | ✅ | ✅ |
| revenue_bi (doanh thu/đơn) | ✅ | ✅ | ✅ | ❌ |
| margin_cogs (giá vốn/margin) | ✅ | ✅ | ❌ | ❌ |
| staff_hr (lương/hiệu suất NV) | ✅ | ✅ | ❌ | ❌ |
| customer_pii (list/SĐT khách) | ✅ | ✅ | ❌ | ❌ |
| internal_kb_other_dept | ✅ | ✅ | theo phòng ban | theo phòng ban |
| system_internal (code/prompt/schema) | ✅ | ❌ | ❌ | ❌ |

- Policy lưu ở `app_settings.access_policy` (admin chỉnh qua **Admin → Cài đặt → Quyền hạn câu hỏi Chatbot**). Thiếu cấu hình → dùng default trên.
- **admin/manager**: bỏ qua hẳn (không tốn call phân loại).
- **FAIL-OPEN**: nếu phân loại lỗi / không chắc (confidence < 0.6) → cho qua, tránh chặn nhầm câu hợp lệ.
- "theo phòng ban" (`dept`): chỉ cho phép khi câu hỏi đúng phòng ban của user (department = "all" → xem tất cả).

### Lark group
Lark dùng trong group → không phân biệt được role (mọi người có thể là `standard`). Guardian ở Lark chạy chế độ riêng: `{ onlyCategories: ["system_internal"], ignoreRole: true }` — **chỉ chặn câu hỏi nội bộ hệ thống** (bot hoạt động thế nào / workflow / code / prompt / schema) → trả lời "bạn hỏi trực tiếp Hiếu nhé 😊". Nghiệp vụ (sản phẩm/doanh thu...) vẫn trả lời bình thường.

### Tránh chồng chéo
- `role_filters` (BI): lọc **row** dữ liệu trong SQL của BI Analyst theo role.
- `DISPLAY_RULES` (prompt agent): nhắc agent tự từ chối code/prompt nội bộ.
- **Guardian**: lấp gap ở mức **category + dept + intent**, chặn xác định trước khi gọi agent.

---

## Lưu ý kỹ thuật
- Model `gemini-3.5-flash` là **thinking model**: phải set `generationConfig.thinkingConfig.thinkingBudget = 0` mới trả JSON ổn định (nếu không, token bị tiêu vào "thinking" → output cụt → JSON.parse lỗi).
- Liên quan: [[system/Second-Brain-Architecture]] · [[vendors/WM-WorldMove]] · [[vendors/3HK]]
