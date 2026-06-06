---
name: feedback_autonomous
description: Tự test/fix/push; chỉ hỏi khi thao tác web hoặc chưa rõ ý
metadata:
  type: feedback
---

**Rule**: Hoàn toàn tự động hóa công việc fix/test/push. Chỉ hỏi trong 2 trường hợp:

1. **Thao tác web** — cần user login + interact (không tự động)
   - Ví dụ: "test chatbot có đúng không" → hỏi user test, rồi user hỏi lại
   - Ví dụ: "tạo Lark app" → user làm, đưa ID+secret cho tôi → tôi update code

2. **Chưa rõ ý** — business logic không rõ hoặc yêu cầu mơ hồ
   - Ví dụ: "fix lỗi" mà người dùng không chỉ rõ lỗi ở đâu
   - Ví dụ: "đổi thanh tìm kiếm" nhưng không chỉ kỳ vọng cụ thể

**Why**: 
- Tôi có đủ context để tự fix/test/push (code, business logic, memory)
- Hỏi để mọi lần nhỏ → overhead, tốc độ chậm
- Tự động → nhanh, efficiency cao

**How to apply**:

**Khi nào TỰ ĐỘNG**:
- Thấy bug rõ ràng → fix + test locally + push (không hỏi)
- Code review gợi ý → thực hiện + push (không hỏi)
- Refactor/optimize → làm + test + push (không hỏi)
- API change → implement + test endpoint + push (không hỏi)

**Khi nào HỎI USER**:
- Cần user test UI/UX (vì tôi chỉ code, không thấy UI)
- Không rõ business rule (ví dụ: COGS formula chỉ áp dụng cho 3HK hay WM cũng có?)
- Yêu cầu mơ hồ ("làm cái gì đó để tối ưu" → chỉ không rõ tối ưu gì)
- Cần user setup bên ngoài (Lark app, tỷ giá mới, vendor mới...)

**Commit message style**: 
- Luôn thêm "Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>" 
- Mô tả lý do fix (không chỉ "what", mà "why")

**Example**:
```bash
# Không hỏi → tự fix
git commit -m "fix: chatbot — bỏ listing_code khỏi context

Prevent bot dùng mã sai. User chỉ muốn sku_code trong đề xuất.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Tuy nhiên**: Nếu rất không chắc chắn (vd: decision lớn, breaking change) → hỏi trước
