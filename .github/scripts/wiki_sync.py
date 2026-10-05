"""Đồng bộ docs/wiki/**/*.md → Supabase kb_wiki_pages (nguồn wiki của Bé Gấu / Gấu Tổ / trang KB web).

Viết lại 2026-10-05 (s223): workflow cũ gọi backend/seeding/import/import_wiki.py nhưng file đó chưa từng được commit
(.gitignore bỏ cả thư mục backend/) → 40/40 lần chạy thất bại, wiki trong repo KHÔNG BAO GIỜ lên chatbot.

Quy tắc:
- Khớp trang theo `title` (frontmatter) — bảng không có cột đường dẫn file. Trùng title nhiều dòng → cập nhật dòng mới nhất, báo cảnh báo.
- Nội dung giống hệt → bỏ qua (không gọi embedding). Khác → lưu bản cũ vào kb_wiki_versions, cập nhật + embedding mới, version+1.
- Chưa có → tạo mới. KHÔNG xoá trang chỉ có trên web.
- Repo là nguồn sự thật cho các trang có trong repo: sửa trên web rồi repo đè lại thì bản web vẫn còn trong kb_wiki_versions.

Chạy: python .github/scripts/wiki_sync.py [--dry-run]
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_KEY (bỏ trống được khi --dry-run).
"""
import glob
import hashlib
import io
import os
import sys
from datetime import datetime, timezone

import requests
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WIKI = os.path.join(ROOT, "docs", "wiki")
DRY = "--dry-run" in sys.argv
SB_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
GEMINI_KEY = os.environ.get("GEMINI_KEY", "")
BY = "wiki-sync"
TIMEOUT = 60


def parse(path):
    raw = io.open(path, encoding="utf-8").read().replace("\r\n", "\n")
    meta, body = {}, raw
    if raw.startswith("---\n"):
        end = raw.find("\n---", 4)
        if end != -1:
            meta = yaml.safe_load(raw[4:end]) or {}
            body = raw[end + 4:].lstrip("\n")
    rel = os.path.relpath(path, WIKI).replace("\\", "/")
    title = str(meta.get("title") or "").strip()
    if not title:
        first = next((l for l in body.splitlines() if l.startswith("# ")), "")
        title = first[2:].strip() or os.path.splitext(os.path.basename(path))[0]
    # None = file không khai báo → trang đã có giữ nguyên ẩn/hiện trên DB; trang mới: system/ hoặc admin-only thì ẩn.
    if "is_hidden" in meta:
        hidden = bool(meta["is_hidden"])
    elif "visibility" in meta:
        hidden = str(meta["visibility"]).lower() == "admin-only"
    else:
        hidden = None
    tags = meta.get("tags") or []
    return {
        "default_hidden": rel.startswith("system/"),
        "rel": rel,
        "title": title,
        "content": body.strip() + "\n",
        "page_type": str(meta.get("page_type") or ("tab_guide" if rel.startswith("system/tabs/") else "reference")),
        "department": str(meta.get("department") or "all"),
        "tags": [str(t) for t in tags] if isinstance(tags, list) else [str(tags)],
        "is_hidden": hidden,
    }


def sb(method, path, **kw):
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}
    headers.update(kw.pop("headers", {}))
    r = requests.request(method, f"{SB_URL}/rest/v1/{path}", headers=headers, timeout=TIMEOUT, **kw)
    if r.status_code >= 300:
        raise RuntimeError(f"{method} {path} → {r.status_code}: {r.text[:300]}")
    return r.json() if r.text else None


def embed(text):
    # Cùng cách web (lib/kb.ts embedText): gemini-embedding-001, 3072 chiều, title + content cắt 2.000 ký tự.
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_KEY}",
        json={"content": {"parts": [{"text": text[:2000]}]}}, timeout=TIMEOUT,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"embed → {r.status_code}: {r.text[:200]}")
    return r.json()["embedding"]["values"]


def norm(s):
    return hashlib.sha1((s or "").replace("\r\n", "\n").strip().encode("utf-8")).hexdigest()


def main():
    pages = [parse(p) for p in sorted(glob.glob(os.path.join(WIKI, "**", "*.md"), recursive=True))]
    seen = {}
    for p in pages:
        if p["title"] in seen:
            print(f"⚠️  Trùng title trong repo: '{p['title']}' ({seen[p['title']]} và {p['rel']}) — chỉ đồng bộ file đầu.")
        seen.setdefault(p["title"], p["rel"])
    pages = [p for p in pages if seen[p["title"]] == p["rel"]]

    if not SB_URL or not SB_KEY:
        if DRY:
            print(f"(dry-run không có Supabase) {len(pages)} file đọc được:")
            for p in pages:
                print(f"  - {p['rel']} → '{p['title']}' [{p['page_type']}/{p['department']}{' ẩn' if p['is_hidden'] else ''}]")
            return 0
        print("Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY"); return 1
    if not DRY and not GEMINI_KEY:
        print("Thiếu GEMINI_KEY"); return 1

    existing = sb("GET", "kb_wiki_pages?select=id,title,content,page_type,department,tags,is_hidden,version,updated_at&order=updated_at.desc")
    by_title = {}
    for row in existing:
        t = (row.get("title") or "").strip()
        if t in by_title:
            print(f"⚠️  DB có nhiều trang cùng title '{t}' — cập nhật trang mới nhất ({by_title[t]['id']}).")
            continue
        by_title[t] = row

    created = updated = skipped = failed = 0
    now = datetime.now(timezone.utc).isoformat()
    for p in pages:
        row = by_title.get(p["title"])
        if p["is_hidden"] is None:
            p["is_hidden"] = bool(row.get("is_hidden")) if row else p["default_hidden"]
        try:
            if row:
                same_meta = (row.get("page_type") == p["page_type"] and row.get("department") == p["department"]
                             and sorted(row.get("tags") or []) == sorted(p["tags"]) and bool(row.get("is_hidden")) == p["is_hidden"])
                if norm(row.get("content")) == norm(p["content"]) and same_meta:
                    skipped += 1
                    continue
                content_changed = norm(row.get("content")) != norm(p["content"])
                print(f"↻ {'CẬP NHẬT' if content_changed else 'meta'}: {p['rel']} → '{p['title']}' (v{row.get('version')})")
                if DRY:
                    updated += 1
                    continue
                patch = {"page_type": p["page_type"], "department": p["department"], "tags": p["tags"],
                         "is_hidden": p["is_hidden"], "updated_by": BY, "updated_at": now}
                if content_changed:
                    # Lưu bản đang có (có thể là bản sửa trên web) trước khi đè — giống luồng sửa trên web.
                    sb("POST", "kb_wiki_versions", json={"page_id": row["id"], "title": row["title"], "content": row.get("content") or "",
                                                          "version": row.get("version") or 1, "updated_by": BY})
                    patch.update({"content": p["content"], "embedding": embed(f"{p['title']}\n\n{p['content']}"),
                                  "version": (row.get("version") or 1) + 1})
                sb("PATCH", f"kb_wiki_pages?id=eq.{row['id']}", json=patch, headers={"Prefer": "return=minimal"})
                updated += 1
            else:
                print(f"＋ TẠO MỚI: {p['rel']} → '{p['title']}'")
                if DRY:
                    created += 1
                    continue
                sb("POST", "kb_wiki_pages", json={
                    "title": p["title"], "content": p["content"], "page_type": p["page_type"], "department": p["department"],
                    "tags": p["tags"], "is_hidden": p["is_hidden"], "visibility_mode": "all",
                    "embedding": embed(f"{p['title']}\n\n{p['content']}"),
                    "version": 1, "created_by": BY, "updated_by": BY,
                }, headers={"Prefer": "return=minimal"})
                created += 1
        except Exception as e:  # 1 trang lỗi không dừng cả lượt
            failed += 1
            print(f"✗ LỖI {p['rel']}: {e}")

    only_web = [t for t in by_title if t not in seen]
    print(f"\n{'[DRY-RUN] ' if DRY else ''}Xong: {len(pages)} file · tạo {created} · cập nhật {updated} · giữ nguyên {skipped} · lỗi {failed}"
          f" · {len(only_web)} trang chỉ có trên web (không đụng).")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
