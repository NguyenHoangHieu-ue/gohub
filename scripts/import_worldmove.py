"""
Import WORLDMOVE product catalog from CSV into ncc_products table.

Usage:
  cd D:/Kien_Thuc/Work/gohub/LamViec/HeThong
  set SUPABASE_URL=https://wfuigmfnfcijkvylrwzz.supabase.co
  set SUPABASE_SERVICE_KEY=<key from key.txt>
  python scripts/import_worldmove.py
"""
import csv
import os
import re
import sys
from supabase import create_client

VENDOR      = "WORLDMOVE"
CSV_PATH    = "VENDOR/WORLDMOVE/WORLDMOVE1.csv"
BATCH_SIZE  = 500


def parse_product_name(name: str) -> dict:
    """Extract days, data_gb, is_daily, is_unlimited, throttle_kbps from product name."""
    result = {
        "days": None,
        "data_gb": None,
        "is_daily": False,
        "is_unlimited": False,
        "throttle_kbps": None,
    }

    # Days
    m = re.search(r"(\d+)\s*[Dd]ays?", name)
    if m:
        result["days"] = int(m.group(1))

    # Unlimited
    if re.search(r"[Uu]nlimited", name):
        result["is_unlimited"] = True
        # Throttle for unlimited packages
        m = re.search(r"(\d+(?:\.\d+)?)\s*[Mm]bps", name, re.IGNORECASE)
        if m:
            result["throttle_kbps"] = int(float(m.group(1)) * 1000)
        m = re.search(r"(\d+)\s*kbps", name, re.IGNORECASE)
        if m:
            result["throttle_kbps"] = int(m.group(1))
        return result

    # GB data
    m = re.search(r"([\d.]+)\s*GB\s*(/day)?", name, re.IGNORECASE)
    if m:
        result["data_gb"] = float(m.group(1))
        result["is_daily"] = m.group(2) is not None

    # MB data (convert to GB)
    if result["data_gb"] is None:
        m = re.search(r"([\d.]+)\s*MB\s*(/day)?", name, re.IGNORECASE)
        if m:
            result["data_gb"] = round(float(m.group(1)) / 1000, 4)
            result["is_daily"] = m.group(2) is not None

    # Throttle
    m = re.search(r"(\d+)\s*kbps", name, re.IGNORECASE)
    if m:
        result["throttle_kbps"] = int(m.group(1))
    else:
        m = re.search(r"(\d+(?:\.\d+)?)\s*[Mm]bps", name, re.IGNORECASE)
        if m:
            result["throttle_kbps"] = int(float(m.group(1)) * 1000)

    return result


def main():
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    sb = create_client(url, key)

    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Loaded {len(rows)} rows from {CSV_PATH}")

    batch = []
    skipped = 0

    for r in rows:
        wm_id = (r.get("wmproductId") or "").strip()
        if not wm_id:
            skipped += 1
            continue

        name = (r.get("product name") or "").strip()
        parsed = parse_product_name(name)

        cogs_raw = (r.get("cost price (NT)") or "").strip()
        cogs = float(cogs_raw) if cogs_raw else None

        batch.append({
            "vendor":              VENDOR,
            "vendor_product_id":   wm_id,
            "vendor_internal_id":  (r.get("productId") or "").strip() or None,
            "product_name":        name or None,
            "region":              (r.get("region") or "").strip() or None,
            "sim_type":            (r.get("type") or "").strip() or None,
            "days":                parsed["days"],
            "data_gb":             parsed["data_gb"],
            "is_daily":            parsed["is_daily"],
            "is_unlimited":        parsed["is_unlimited"],
            "throttle_kbps":       parsed["throttle_kbps"],
            "cogs":                cogs,
            "cogs_currency":       "TWD",
            "is_kyc":              False,
            "is_lesim":            (r.get("leSIM") or "").strip().upper() == "Y",
            "status":              "active",
        })

        if len(batch) >= BATCH_SIZE:
            sb.table("ncc_products").upsert(
                batch, on_conflict="vendor,vendor_product_id"
            ).execute()
            print(f"  Upserted {len(batch)} rows...")
            batch = []

    if batch:
        sb.table("ncc_products").upsert(
            batch, on_conflict="vendor,vendor_product_id"
        ).execute()
        print(f"  Upserted {len(batch)} rows (final batch)")

    print(f"Done. Skipped {skipped} rows with empty wmproductId.")


if __name__ == "__main__":
    main()
