"""
Sync GoHub API data → Supabase.
Chạy bởi GitHub Actions mỗi 30 phút, hoặc thủ công: python sync.py
"""
import os
import dataclasses
from datetime import datetime, timezone
from supabase import create_client
from gohub_api_clients import GohubClient

API_KEY           = os.environ["API_KEY"]
SUPABASE_URL      = os.environ["SUPABASE_URL"]
SUPABASE_KEY      = os.environ["SUPABASE_SERVICE_KEY"]

CHUNK = 500  # records per upsert batch

def upsert(sb, table: str, rows: list[dict], pk: str):
    now = datetime.now(timezone.utc).isoformat()
    for i in range(0, len(rows), CHUNK):
        batch = [{**r, "synced_at": now} for r in rows[i:i + CHUNK]]
        sb.table(table).upsert(batch, on_conflict=pk).execute()

def main():
    client = GohubClient(api_key=API_KEY)
    sb     = create_client(SUPABASE_URL, SUPABASE_KEY)

    tasks = [
        ("products", client.get_all_products, "product_code"),
        ("skus",     client.get_all_skus,     "sku_code"),
        ("listings", client.get_all_listings, "listing_code"),
        ("items",    client.get_all_items,    "item_code"),
    ]

    for table, fetch_fn, pk in tasks:
        print(f"[{table}] Fetching...", flush=True)
        records = fetch_fn()
        rows    = [dataclasses.asdict(r) for r in records]
        print(f"[{table}] Upserting {len(rows):,} rows...", flush=True)
        upsert(sb, table, rows, pk)
        sb.table("sync_log").upsert(
            {"table_name": table, "last_sync": datetime.now(timezone.utc).isoformat(),
             "record_count": len(rows)},
            on_conflict="table_name",
        ).execute()
        print(f"[{table}] Done ✓", flush=True)

if __name__ == "__main__":
    main()
