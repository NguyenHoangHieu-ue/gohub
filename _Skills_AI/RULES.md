# RULES.md — Quy Tắc Quản Lý Tài Liệu

> Áp dụng cho mọi AI assistant làm việc trong project này.
> **Nguyên tắc cốt lõi: Thêm vào file có sẵn, KHÔNG tạo file mới.**

---

## 1. Bản Đồ File — Thêm Gì Vào Đâu

| Loại nội dung | File đích |
|---|---|
| Session log / việc đã làm trong session | `docs/session_summary.txt` |
| Bug mới / bug đã fix | `Bug.txt` |
| Phase hoàn thành / milestone / checklist | `WORK.md` — section tương ứng |
| Thay đổi agent system (tools, prompts, cache) | `_Skills_AI/agents/AGENTS.md` |
| Quy tắc coding cho AI | `_Skills_AI/CLAUDE.md` |
| Quy tắc frontend / UI | `_Skills_AI/FESkill.md` |
| Quy tắc tài liệu (file này) | `_Skills_AI/RULES.md` |
| Bối cảnh công ty / business context | `docs/MoTaChiTiet.md` |
| Credentials / secrets | `.env.local` ONLY — không commit lên GitHub |

---

## 2. Khi Nào Tạo File Mới?

**CHỈ tạo file mới khi KHÔNG có file nào trong bảng trên phù hợp.**

**KHÔNG tạo file mới cho:**
- Session mới → **append** vào `docs/session_summary.txt`
- Phase/milestone xong → **update** `WORK.md`, **không** tạo `PHASE_X_COMPLETED.md`
- Bug fix → **tick ✓** trong `Bug.txt`, không tạo `bugfix_session_X.md`
- Hướng dẫn setup đã obsolete → **xóa** hoặc fold vào `WORK.md`

---

## 3. Ký Hiệu Trạng Thái

| Ký hiệu | Nghĩa |
|---|---|
| `[ ]` | Chưa làm |
| `[x]` hoặc `✅` | Đã hoàn thành |
| `⏳` | Đang làm / in progress |
| `❌` | Cancelled / không làm nữa |
| `🔜` | Planned / sắp làm |

**Quy tắc:** Khi task/phase xong → cập nhật ký hiệu **ngay**, không để `[ ]` khi thực tế đã xong.

---

## 4. Checklist Cuối Mỗi Session

Mỗi khi kết thúc session làm việc:

1. **Append** session log vào `docs/session_summary.txt` (định dạng `## Session N (YYYY-MM-DD)`)
2. **Update** `WORK.md` nếu phase/checklist thay đổi trạng thái
3. **Tick ✓** bugs đã fix trong `Bug.txt`
4. **Không** tạo file `session_XX_summary.txt` hay `PHASE_X_COMPLETED.md` riêng lẻ

---

## 5. Cấu Trúc Tài Liệu Hiện Tại

```
docs/
├── session_summary.txt    ← TOÀN BỘ session history (append mỗi session)
└── MoTaChiTiet.md         ← Bối cảnh công ty

_Skills_AI/
├── CLAUDE.md              ← Quy tắc coding cho AI
├── FESkill.md             ← Quy tắc frontend / UI
├── RULES.md               ← File này — quy tắc tài liệu
└── agents/
    └── AGENTS.md          ← Mô tả 5 agents chatbot

Bug.txt                    ← Danh sách bug (tick ✓ khi xong, không xóa dòng)
WORK.md                    ← Kế hoạch Neo4j/PhoBERT (4 phases, mark ✅ khi xong)
```

---

## 6. Xử Lý Credentials

- **Không bao giờ** để file `.txt` / `.md` chứa password/secret key trong repo
- Credentials chỉ đặt trong `.env.local` (đã gitignore)
- Nếu lỡ commit credentials → coi như lộ, đổi key ngay
