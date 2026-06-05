"""
Import 3HK zone reference data into ncc_3hk_zones table.

Usage:
  cd D:/Kien_Thuc/Work/gohub/LamViec/HeThong
  set SUPABASE_URL=https://wfuigmfnfcijkvylrwzz.supabase.co
  set SUPABASE_SERVICE_KEY=<key from key.txt>
  python scripts/import_3hk.py
"""
import os
import sys
import openpyxl
from supabase import create_client

XLSX_PATH    = "VENDOR/3HK/3HK_zone_cogs & network.xlsx"
KYC_REQUIRED = {"Hong Kong", "Taiwan"}  # chỉ 2 nước này cần KYC


def main():
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    sb = create_client(url, key)

    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb["Sheet1"]

    rows = []
    current_zone  = None
    current_price = None

    for row in ws.iter_rows(min_row=2, values_only=True):
        zone_val, country, network, price = row[0], row[1], row[2], row[3]

        # Empty row = end of data
        if country is None:
            continue

        # New zone group starts when zone_val is present
        if zone_val is not None:
            current_zone  = str(zone_val).strip()
            current_price = float(price) if price is not None else None

        country = str(country).strip()
        rows.append({
            "zone":             current_zone,
            "country":          country,
            "network":          str(network).strip() if network else None,
            "price_per_gb_hkd": current_price,
            "is_kyc":           country in KYC_REQUIRED,
        })

    print(f"Parsed {len(rows)} zone-country rows from {XLSX_PATH}")

    # Clear existing data and re-insert
    sb.table("ncc_3hk_zones").delete().neq("id", 0).execute()
    sb.table("ncc_3hk_zones").insert(rows).execute()
    print(f"Inserted {len(rows)} rows into ncc_3hk_zones.")


if __name__ == "__main__":
    main()
