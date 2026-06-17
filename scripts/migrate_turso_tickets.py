"""
migrate_turso_tickets.py
Đọc lark_tickets từ Turso → upsert vào Supabase lark_cs_tickets

Chạy:
  C:/Users/hieuh/AppData/Local/Programs/Python/Python311/python.exe scripts/migrate_turso_tickets.py
"""

import json
import urllib.request
import urllib.error
import ssl

# ── Config ────────────────────────────────────────────────────────────────────
TURSO_URL   = "https://gohub-intel-baole.aws-ap-northeast-1.turso.io"
TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzU0NjMwNzEsImlkIjoiMDE5ZDYxZDctMjcwMS03MDI1LWE0ZGItYmY5NDc0N2Q2ZDNmIiwicmlkIjoiYzlhY2Y3YjYtNTg4OC00Y2QyLWI4ZjktZDA0ODJkYTBhOTg3In0.ReIz6_MHX59QbwMqrlkrCD3NpXZX8aQVDlIjFMFxM29VJ5rR2HLdVWVYat8lLa2AtrkJNEgtka9Y_XtZ-n2HCg"

SUPABASE_URL = "https://wfuigmfnfcijkvylrwzz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdWlnbWZuZmNpamt2eWxyd3p6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ3MDgxNiwiZXhwIjoyMDk2MDQ2ODE2fQ.0XvbKXseTFTx9iQzmYlXSwoT0bxu2CI8-wrCEMv8ipo"

# ── HTTP helpers ──────────────────────────────────────────────────────────────
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def http_post(url, headers, body_dict):
    data = json.dumps(body_dict).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, context=ctx) as res:
        return json.loads(res.read().decode("utf-8"))

# ── Turso query ───────────────────────────────────────────────────────────────
def turso_query(sql):
    body = {
        "requests": [
            {"type": "execute", "stmt": {"sql": sql}},
            {"type": "close"},
        ]
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TURSO_TOKEN}",
    }
    resp = http_post(f"{TURSO_URL}/v2/pipeline", headers, body)
    result = resp["results"][0]
    if result["type"] != "ok":
        raise Exception(f"Turso error: {result}")
    cols = [c["name"] for c in result["response"]["result"]["cols"]]
    rows = result["response"]["result"]["rows"]
    return [dict(zip(cols, [cell.get("value") if isinstance(cell, dict) else cell for cell in row])) for row in rows]

# ── Supabase upsert ───────────────────────────────────────────────────────────
def supabase_upsert(rows):
    url = f"{SUPABASE_URL}/rest/v1/lark_cs_tickets?on_conflict=lark_record_id"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "resolution=merge-duplicates",
    }
    data = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, context=ctx) as res:
            return res.getcode()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise Exception(f"Supabase error {e.code}: {body}")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("[1] Ket noi Turso...")
    count_rows = turso_query("SELECT COUNT(*) as cnt FROM lark_tickets")
    total = int(count_rows[0].get("cnt", 0))
    print(f"[2] Tong lark_tickets trong Turso: {total}")

    if total == 0:
        print("[!] Turso khong co tickets. Thoat.")
        return

    offset = 0
    batch_size = 200
    total_upserted = 0

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

    print(f"\nDONE! {total_upserted} tickets da migrate sang Supabase lark_cs_tickets.")

if __name__ == "__main__":
    main()
