"""
migrate_turso_tickets.py
Đọc lark_tickets từ Turso → upsert vào Supabase lark_cs_tickets

Setup:
  Set env vars (hoặc tạo .env.local):
    TURSO_URL=libsql://...
    TURSO_AUTH_TOKEN=eyJ...
    SUPABASE_URL=https://...supabase.co
    SUPABASE_SERVICE_KEY=eyJ...

Chạy:
  python scripts/migrate_turso_tickets.py
  # hoặc:
  C:/Users/hieuh/AppData/Local/Programs/Python/Python311/python.exe scripts/migrate_turso_tickets.py
"""

import json, os
import requests
from pathlib import Path

# ── Load env from .env.local nếu có ──────────────────────────────────────────
env_file = Path(__file__).parent.parent / "web" / ".env.local"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

TURSO_URL    = os.environ.get("TURSO_URL", "")
TURSO_TOKEN  = os.environ.get("TURSO_AUTH_TOKEN", "")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not TURSO_URL or not TURSO_TOKEN:
    raise SystemExit("Thieu TURSO_URL hoac TURSO_AUTH_TOKEN trong env vars")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit("Thieu NEXT_PUBLIC_SUPABASE_URL hoac SUPABASE_SERVICE_KEY trong env vars")

# Convert libsql:// → https://
TURSO_HTTP = TURSO_URL.replace("libsql://", "https://").replace("http://", "https://")

# ── HTTP helpers ──────────────────────────────────────────────────────────────
# 1 Session dùng chung → HTTP Keep-Alive, tái sử dụng kết nối TLS cho mọi batch
# (120+ batch cho 24k+ dòng) thay vì bắt tay TLS mới mỗi request như urllib.
session = requests.Session()
session.verify = False   # giữ nguyên hành vi bản cũ (ssl.CERT_NONE)
try:
    from urllib3.exceptions import InsecureRequestWarning
    requests.packages.urllib3.disable_warnings(InsecureRequestWarning)
except Exception:
    pass

def http_post(url, headers, body_dict):
    res = session.post(url, json=body_dict, headers=headers)
    res.raise_for_status()
    return res.json()

def turso_query(sql):
    body = {"requests": [{"type": "execute", "stmt": {"sql": sql}}, {"type": "close"}]}
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {TURSO_TOKEN}"}
    resp   = http_post(f"{TURSO_HTTP}/v2/pipeline", headers, body)
    result = resp["results"][0]
    if result["type"] != "ok":
        raise Exception(f"Turso error: {result}")
    cols = [c["name"] for c in result["response"]["result"]["cols"]]
    rows = result["response"]["result"]["rows"]
    return [dict(zip(cols, [cell.get("value") if isinstance(cell, dict) else cell for cell in row])) for row in rows]

def supabase_upsert(rows):
    url     = f"{SUPABASE_URL}/rest/v1/lark_cs_tickets?on_conflict=lark_record_id"
    headers = {
        "Content-Type": "application/json",
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer":        "resolution=merge-duplicates",
    }
    res = session.post(url, json=rows, headers=headers)
    if res.status_code >= 400:
        raise Exception(f"Supabase error {res.status_code}: {res.text}")
    return res.status_code

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("[1] Ket noi Turso...")
    count_rows = turso_query("SELECT COUNT(*) as cnt FROM lark_tickets")
    total      = int(count_rows[0].get("cnt", 0))
    print(f"[2] Tong lark_tickets trong Turso: {total}")

    if total == 0:
        print("[!] Turso khong co tickets. Thoat.")
        return

    offset, batch_size, total_upserted = 0, 200, 0
    while offset < total:
        rows = turso_query(
            f"SELECT * FROM lark_tickets ORDER BY creation_date DESC LIMIT {batch_size} OFFSET {offset}"
        )
        if not rows:
            break
        upsert_rows = []
        for r in rows:
            rid = str(r.get("lark_record_id") or "").strip()
            if not rid:
                continue
            cd = r.get("creation_date")
            lt = r.get("leadtime_minutes")
            upsert_rows.append({
                "lark_record_id":   rid,
                "ticket_no":        str(r.get("ticket_no")    or ""),
                "order_no":         str(r.get("order_no")     or ""),
                "sku":              str(r.get("sku")           or ""),
                "ticket_type":      str(r.get("ticket_type")  or ""),
                "issue_detail":     str(r.get("issue_detail") or ""),
                "details":          str(r.get("details")      or ""),
                "source":           str(r.get("source")       or ""),
                "channel":          str(r.get("channel")      or ""),
                "vendor":           str(r.get("vendor")       or ""),
                "handler":          str(r.get("handler")      or ""),
                "product_action":   str(r.get("product_action") or ""),
                "money_action":     str(r.get("money_action")   or ""),
                "creation_date":    int(cd) if cd is not None else None,
                "ticket_status":    str(r.get("ticket_status") or ""),
                "leadtime_minutes": float(lt) if lt is not None else None,
                "source_1":         str(r.get("source_1")    or ""),
            })
        if upsert_rows:
            supabase_upsert(upsert_rows)
        total_upserted += len(upsert_rows)
        offset += batch_size
        print(f"  OK {total_upserted}/{total} tickets upserted...")

    print(f"\nDONE! {total_upserted} tickets migrated to Supabase lark_cs_tickets.")

if __name__ == "__main__":
    main()
