"""
Sync GoHub API data → Supabase.
GitHub Actions: chạy tự động mỗi ngày lúc 01:00 UTC
Local: cd sync && python sync.py  (cần set env vars API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)
"""
import os
import dataclasses
from datetime import datetime, timezone
from supabase import create_client
from gohub_api_clients import GohubClient

API_KEY      = os.environ["API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

CHUNK      = 500
FULL_TYPES = {"C", "E", "1", "2"}

def upsert(sb, table: str, rows: list[dict], pk: str):
    now = datetime.now(timezone.utc).isoformat()
    for i in range(0, len(rows), CHUNK):
        batch = [{**r, "synced_at": now} for r in rows[i:i + CHUNK]]
        sb.table(table).upsert(batch, on_conflict=pk).execute()

def fetch_all_rows(sb, table: str, select: str) -> list[dict]:
    """Fetch toàn bộ rows, bypass Supabase 1000-row limit."""
    all_rows, page = [], 0
    while True:
        res = sb.table(table).select(select).range(page, page + CHUNK - 1).execute()
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < CHUNK:
            break
        page += CHUNK
    return all_rows

def sync_sku_catalog(sb):
    """Rebuild bảng sku_catalog từ skus + products (chỉ full-type C/E/1/2)."""
    print("[sku_catalog] Fetching skus + products...", flush=True)

    skus_raw = fetch_all_rows(sb,
        "skus",
        "sku_code,product_code,tenant,status,sim_esim,product_type,"
        "data_amount,data_amount_unit,day_amount,throttle_speed,call,"
        "vendor_sku,latest_cogs,latest_cogs_currency"
    )

    prods_raw = fetch_all_rows(sb,
        "products",
        "product_code,product_type,hotspot,kyc_needed,operator_code,network_type,note"
    )
    prod_map = {p["product_code"]: p for p in prods_raw}

    # Lọc chỉ giữ full-type dựa trên ký tự thứ 2 của sku_code (index 1)
    full_skus = [
        s for s in skus_raw
        if len(s.get("sku_code") or "") == 13
        and s["sku_code"][1] in FULL_TYPES
    ]

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for s in full_skus:
        code = s["sku_code"]
        p    = prod_map.get(s.get("product_code") or "", {})
        amt  = s.get("data_amount")
        rows.append({
            "sku_code":             code,
            "product_code":         s.get("product_code"),
            "tenant":               s.get("tenant"),
            "status":               s.get("status"),
            "sim_esim":             s.get("sim_esim"),
            "product_type":         p.get("product_type") or code[1],
            "country_group":        code[2:5],
            "data_amount":          amt,
            "data_amount_unit":     s.get("data_amount_unit"),
            "is_unlimited":         (amt or 0) >= 9999,
            "day_amount":           s.get("day_amount"),
            "throttle_speed":       s.get("throttle_speed"),
            "call":                 s.get("call"),
            "hotspot":              p.get("hotspot"),
            "kyc_needed":           p.get("kyc_needed"),
            "operator_code":        p.get("operator_code"),
            "network_type":         p.get("network_type"),
            "vendor_sku":           s.get("vendor_sku"),
            "latest_cogs":          s.get("latest_cogs"),
            "latest_cogs_currency": s.get("latest_cogs_currency"),
            "note":                 p.get("note"),
            "synced_at":            now,
        })

    print(f"[sku_catalog] Upserting {len(rows):,} rows...", flush=True)
    upsert(sb, "sku_catalog", rows, "sku_code")
    print(f"[sku_catalog] Done ({len(rows)} rows)", flush=True)

def main():
    client = GohubClient(api_key=API_KEY)
    sb     = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Sync 4 bảng chính từ GoHub API
    tasks = [
        ("products", client.get_all_products, "product_code"),
        ("skus",     client.get_all_skus,     "sku_code"),
        ("listings", client.get_all_listings, "listing_code"),
        ("items",    client.get_all_items,    "item_code"),
    ]

    # Cột đã DROP khỏi DB — phải loại bỏ trước khi upsert
    DROP_COLS = {
        "skus":     {"original_cost", "reference_cost_vnd",
                     "final_cogs_included_vat_vnd", "final_cogs_usd", "wr_group"},
        "products": {"data_plan_type"},
    }

    for table, fetch_fn, pk in tasks:
        print(f"[{table}] Fetching...", flush=True)
        records = fetch_fn()
        rows = [dataclasses.asdict(r) for r in records]
        if table in DROP_COLS:
            drop = DROP_COLS[table]
            rows = [{k: v for k, v in r.items() if k not in drop} for r in rows]
        print(f"[{table}] Upserting {len(rows):,} rows...", flush=True)
        upsert(sb, table, rows, pk)
        sb.table("sync_log").upsert(
            {"table_name": table, "last_sync": datetime.now(timezone.utc).isoformat(),
             "record_count": len(rows)},
            on_conflict="table_name",
        ).execute()
        print(f"[{table}] Done ✓", flush=True)

    # Rebuild sku_catalog sau khi sync skus + products xong
    sync_sku_catalog(sb)

    # Cập nhật cột exist trên ncc_worldmove sau khi sync skus xong
    sync_ncc_exist(sb)

def sync_ncc_exist(sb):
    """Cập nhật cột exist (Yes/No) trên ncc_worldmove.
    exist='Yes' khi có ít nhất 1 SKU Active trong hệ thống khớp vendor_sku = vendor_product_id.
    Chạy tự động sau mỗi lần sync skus.
    """
    print("[ncc_exist] Updating exist column...", flush=True)

    # Fetch toàn bộ vendor_sku của WM từ skus (bypass 1000-row cap)
    sys_rows = fetch_all_rows(sb, "skus", "vendor_sku,status")
    sys_set  = {
        r["vendor_sku"]
        for r in sys_rows
        if (r.get("vendor_sku") or "").startswith("WM-")
        and r.get("status") == "Active"
    }

    # Fetch toàn bộ WM product IDs
    wm_rows  = fetch_all_rows(sb, "ncc_worldmove", "vendor_product_id")
    yes_ids  = [r["vendor_product_id"] for r in wm_rows if r["vendor_product_id"] in sys_set]
    no_ids   = [r["vendor_product_id"] for r in wm_rows if r["vendor_product_id"] not in sys_set]

    for i in range(0, len(yes_ids), CHUNK):
        sb.table("ncc_worldmove").update({"exist": "Yes"}).in_(
            "vendor_product_id", yes_ids[i:i + CHUNK]
        ).execute()
    for i in range(0, len(no_ids), CHUNK):
        sb.table("ncc_worldmove").update({"exist": "No"}).in_(
            "vendor_product_id", no_ids[i:i + CHUNK]
        ).execute()

    print(f"[ncc_exist] Done — exist=Yes: {len(yes_ids)}, exist=No: {len(no_ids)}", flush=True)

if __name__ == "__main__":
    main()
