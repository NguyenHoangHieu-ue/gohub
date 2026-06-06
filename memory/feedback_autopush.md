---
name: feedback_autopush
description: Tự động commit + push GitHub sau mỗi lần sửa code xong
metadata:
  type: feedback
---

**Rule**: Sau mỗi lần hoàn thành fix/feature → tự động `git add + git commit + git push` lên branch main

**Why**: 
- Tránh mất mát công việc (nếu máy crash, phải làm lại)
- Review history rõ ràng → dễ rollback nếu cần
- Ci/CD tự động trigger (GitHub Actions) → deploy sớm

**How to apply**:
- Mỗi lần fix xong 1 vấn đề → commit ngay lập tức (không chờ nhiều vấn đề)
- Commit message: tên vấn đề + lý do ngắn
- Ko cần hỏi user trước — tự push lên (user đã cho phép qua "autonomous" rule)
- Nếu push fail (conflict, hook error) → fix + retry tự động, hoặc hỏi user nếu không giải quyết được

**Example**:
```
git commit -m "fix: chatbot — decode quốc gia + rule 3HK rõ ràng

#1 Không tìm thấy sản phẩm theo nước...
#2 3HK tự tính gói...

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
git push
```
