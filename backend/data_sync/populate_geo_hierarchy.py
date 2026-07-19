"""
Populate continent + sub_region cho ref_countries (212 rows).
Chạy sau khi migration v2 đã được áp dụng.

Usage:
  set SUPABASE_URL=https://wfuigmfnfcijkvylrwzz.supabase.co
  set SUPABASE_SERVICE_KEY=<key>
  python database/import/populate_geo_hierarchy.py
"""

import os, sys
from supabase import create_client

# ── Geo hierarchy mapping (ISO 2-char → continent, sub_region) ───────────────

GEO = {
    # ── East Asia ──────────────────────────────────────────────────────────────
    "JP": ("Asia", "East Asia"),
    "KR": ("Asia", "East Asia"),
    "TW": ("Asia", "East Asia"),
    "HK": ("Asia", "East Asia"),
    "MO": ("Asia", "East Asia"),
    "CN": ("Asia", "East Asia"),
    "MN": ("Asia", "East Asia"),

    # ── Southeast Asia ─────────────────────────────────────────────────────────
    "SG": ("Asia", "Southeast Asia"),
    "TH": ("Asia", "Southeast Asia"),
    "MY": ("Asia", "Southeast Asia"),
    "PH": ("Asia", "Southeast Asia"),
    "ID": ("Asia", "Southeast Asia"),
    "VN": ("Asia", "Southeast Asia"),
    "MM": ("Asia", "Southeast Asia"),
    "KH": ("Asia", "Southeast Asia"),
    "LA": ("Asia", "Southeast Asia"),
    "BN": ("Asia", "Southeast Asia"),
    "TL": ("Asia", "Southeast Asia"),

    # ── South Asia ─────────────────────────────────────────────────────────────
    "IN": ("Asia", "South Asia"),
    "LK": ("Asia", "South Asia"),
    "BD": ("Asia", "South Asia"),
    "NP": ("Asia", "South Asia"),
    "PK": ("Asia", "South Asia"),
    "BT": ("Asia", "South Asia"),
    "MV": ("Asia", "South Asia"),

    # ── Central Asia ───────────────────────────────────────────────────────────
    "KZ": ("Asia", "Central Asia"),
    "UZ": ("Asia", "Central Asia"),
    "TM": ("Asia", "Central Asia"),
    "TJ": ("Asia", "Central Asia"),
    "KG": ("Asia", "Central Asia"),

    # ── Western Asia / Middle East ─────────────────────────────────────────────
    "AE": ("Middle East", "Gulf States"),
    "SA": ("Middle East", "Gulf States"),
    "QA": ("Middle East", "Gulf States"),
    "KW": ("Middle East", "Gulf States"),
    "BH": ("Middle East", "Gulf States"),
    "OM": ("Middle East", "Gulf States"),
    "YE": ("Middle East", "Arabian Peninsula"),
    "JO": ("Middle East", "Levant"),
    "LB": ("Middle East", "Levant"),
    "SY": ("Middle East", "Levant"),
    "IQ": ("Middle East", "Levant"),
    "IL": ("Middle East", "Levant"),
    "PS": ("Middle East", "Levant"),
    "IR": ("Middle East", "Iran"),
    "TR": ("Middle East", "Turkey"),  # geographically bridging Europe/Asia

    # ── Western Europe ─────────────────────────────────────────────────────────
    "GB": ("Europe", "Western Europe"),
    "IE": ("Europe", "Western Europe"),
    "FR": ("Europe", "Western Europe"),
    "DE": ("Europe", "Western Europe"),
    "AT": ("Europe", "Western Europe"),
    "CH": ("Europe", "Western Europe"),
    "NL": ("Europe", "Western Europe"),
    "BE": ("Europe", "Western Europe"),
    "LU": ("Europe", "Western Europe"),
    "MC": ("Europe", "Western Europe"),
    "LI": ("Europe", "Western Europe"),
    "AD": ("Europe", "Western Europe"),

    # ── Northern Europe ────────────────────────────────────────────────────────
    "SE": ("Europe", "Northern Europe"),
    "NO": ("Europe", "Northern Europe"),
    "DK": ("Europe", "Northern Europe"),
    "FI": ("Europe", "Northern Europe"),
    "IS": ("Europe", "Northern Europe"),
    "EE": ("Europe", "Northern Europe"),
    "LV": ("Europe", "Northern Europe"),
    "LT": ("Europe", "Northern Europe"),
    "AX": ("Europe", "Northern Europe"),  # Åland Islands

    # ── Southern Europe ────────────────────────────────────────────────────────
    "IT": ("Europe", "Southern Europe"),
    "ES": ("Europe", "Southern Europe"),
    "PT": ("Europe", "Southern Europe"),
    "GR": ("Europe", "Southern Europe"),
    "MT": ("Europe", "Southern Europe"),
    "CY": ("Europe", "Southern Europe"),
    "SI": ("Europe", "Southern Europe"),
    "HR": ("Europe", "Southern Europe"),
    "BA": ("Europe", "Southern Europe"),
    "ME": ("Europe", "Southern Europe"),
    "RS": ("Europe", "Southern Europe"),
    "MK": ("Europe", "Southern Europe"),
    "AL": ("Europe", "Southern Europe"),
    "GI": ("Europe", "Southern Europe"),
    "SM": ("Europe", "Southern Europe"),
    "VA": ("Europe", "Southern Europe"),

    # ── Eastern Europe ─────────────────────────────────────────────────────────
    "PL": ("Europe", "Eastern Europe"),
    "CZ": ("Europe", "Eastern Europe"),
    "SK": ("Europe", "Eastern Europe"),
    "HU": ("Europe", "Eastern Europe"),
    "RO": ("Europe", "Eastern Europe"),
    "BG": ("Europe", "Eastern Europe"),
    "UA": ("Europe", "Eastern Europe"),
    "BY": ("Europe", "Eastern Europe"),
    "MD": ("Europe", "Eastern Europe"),
    "RU": ("Europe", "Eastern Europe"),  # conventionally both Europe/Asia; use Europe for business
    "GE": ("Europe", "Eastern Europe"),
    "AM": ("Europe", "Eastern Europe"),
    "AZ": ("Europe", "Eastern Europe"),
    "XK": ("Europe", "Eastern Europe"),  # Kosovo

    # ── North America ──────────────────────────────────────────────────────────
    "US": ("Americas", "North America"),
    "CA": ("Americas", "North America"),
    "MX": ("Americas", "North America"),
    "GL": ("Americas", "North America"),
    "PM": ("Americas", "North America"),

    # ── Central America & Caribbean ────────────────────────────────────────────
    "GT": ("Americas", "Central America"),
    "BZ": ("Americas", "Central America"),
    "HN": ("Americas", "Central America"),
    "SV": ("Americas", "Central America"),
    "NI": ("Americas", "Central America"),
    "CR": ("Americas", "Central America"),
    "PA": ("Americas", "Central America"),
    "CU": ("Americas", "Caribbean"),
    "JM": ("Americas", "Caribbean"),
    "HT": ("Americas", "Caribbean"),
    "DO": ("Americas", "Caribbean"),
    "PR": ("Americas", "Caribbean"),
    "TT": ("Americas", "Caribbean"),
    "BB": ("Americas", "Caribbean"),
    "LC": ("Americas", "Caribbean"),
    "VC": ("Americas", "Caribbean"),
    "GD": ("Americas", "Caribbean"),
    "AG": ("Americas", "Caribbean"),
    "KN": ("Americas", "Caribbean"),
    "DM": ("Americas", "Caribbean"),
    "AW": ("Americas", "Caribbean"),
    "CW": ("Americas", "Caribbean"),
    "MQ": ("Americas", "Caribbean"),
    "GP": ("Americas", "Caribbean"),
    "VI": ("Americas", "Caribbean"),
    "TC": ("Americas", "Caribbean"),
    "KY": ("Americas", "Caribbean"),
    "BM": ("Americas", "Caribbean"),
    "BS": ("Americas", "Caribbean"),
    "VG": ("Americas", "Caribbean"),

    # ── South America ──────────────────────────────────────────────────────────
    "BR": ("Americas", "South America"),
    "AR": ("Americas", "South America"),
    "CL": ("Americas", "South America"),
    "CO": ("Americas", "South America"),
    "PE": ("Americas", "South America"),
    "VE": ("Americas", "South America"),
    "EC": ("Americas", "South America"),
    "BO": ("Americas", "South America"),
    "PY": ("Americas", "South America"),
    "UY": ("Americas", "South America"),
    "GY": ("Americas", "South America"),
    "SR": ("Americas", "South America"),
    "GF": ("Americas", "South America"),

    # ── Oceania ────────────────────────────────────────────────────────────────
    "AU": ("Oceania", "Australasia"),
    "NZ": ("Oceania", "Australasia"),
    "PG": ("Oceania", "Melanesia"),
    "FJ": ("Oceania", "Melanesia"),
    "VU": ("Oceania", "Melanesia"),
    "SB": ("Oceania", "Melanesia"),
    "NC": ("Oceania", "Melanesia"),
    "WS": ("Oceania", "Polynesia"),
    "TO": ("Oceania", "Polynesia"),
    "TV": ("Oceania", "Polynesia"),
    "CK": ("Oceania", "Polynesia"),
    "WF": ("Oceania", "Polynesia"),
    "PF": ("Oceania", "Polynesia"),
    "PW": ("Oceania", "Micronesia"),
    "FM": ("Oceania", "Micronesia"),
    "MH": ("Oceania", "Micronesia"),
    "KI": ("Oceania", "Micronesia"),
    "NR": ("Oceania", "Micronesia"),
    "GU": ("Oceania", "Micronesia"),
    "MP": ("Oceania", "Micronesia"),

    # ── North Africa ───────────────────────────────────────────────────────────
    "EG": ("Africa", "North Africa"),
    "MA": ("Africa", "North Africa"),
    "TN": ("Africa", "North Africa"),
    "DZ": ("Africa", "North Africa"),
    "LY": ("Africa", "North Africa"),
    "SD": ("Africa", "North Africa"),
    "MR": ("Africa", "North Africa"),

    # ── Sub-Saharan Africa ─────────────────────────────────────────────────────
    "ZA": ("Africa", "Southern Africa"),
    "NG": ("Africa", "West Africa"),
    "GH": ("Africa", "West Africa"),
    "SN": ("Africa", "West Africa"),
    "CI": ("Africa", "West Africa"),
    "ML": ("Africa", "West Africa"),
    "BF": ("Africa", "West Africa"),
    "GN": ("Africa", "West Africa"),
    "TG": ("Africa", "West Africa"),
    "BJ": ("Africa", "West Africa"),
    "NE": ("Africa", "West Africa"),
    "LR": ("Africa", "West Africa"),
    "SL": ("Africa", "West Africa"),
    "GM": ("Africa", "West Africa"),
    "CV": ("Africa", "West Africa"),
    "ST": ("Africa", "West Africa"),
    "KE": ("Africa", "East Africa"),
    "TZ": ("Africa", "East Africa"),
    "ET": ("Africa", "East Africa"),
    "UG": ("Africa", "East Africa"),
    "RW": ("Africa", "East Africa"),
    "BI": ("Africa", "East Africa"),
    "SO": ("Africa", "East Africa"),
    "DJ": ("Africa", "East Africa"),
    "ER": ("Africa", "East Africa"),
    "MG": ("Africa", "East Africa"),
    "MU": ("Africa", "East Africa"),
    "SC": ("Africa", "East Africa"),
    "KM": ("Africa", "East Africa"),
    "CM": ("Africa", "Central Africa"),
    "CD": ("Africa", "Central Africa"),
    "CG": ("Africa", "Central Africa"),
    "GA": ("Africa", "Central Africa"),
    "CF": ("Africa", "Central Africa"),
    "TD": ("Africa", "Central Africa"),
    "GQ": ("Africa", "Central Africa"),
    "ZM": ("Africa", "Southern Africa"),
    "ZW": ("Africa", "Southern Africa"),
    "MZ": ("Africa", "Southern Africa"),
    "BW": ("Africa", "Southern Africa"),
    "NA": ("Africa", "Southern Africa"),
    "SZ": ("Africa", "Southern Africa"),
    "LS": ("Africa", "Southern Africa"),
    "AO": ("Africa", "Central Africa"),
    "MW": ("Africa", "Southern Africa"),
}

# ── Sub-region display names (Vietnamese) ────────────────────────────────────
SUB_REGION_VN = {
    "East Asia":        "Đông Bắc Á",
    "Southeast Asia":   "Đông Nam Á",
    "South Asia":       "Nam Á",
    "Central Asia":     "Trung Á",
    "Gulf States":      "Các nước Vùng Vịnh",
    "Arabian Peninsula":"Bán đảo Ả Rập",
    "Levant":           "Cận Đông",
    "Turkey":           "Thổ Nhĩ Kỳ",
    "Iran":             "Iran",
    "Western Europe":   "Tây Âu",
    "Northern Europe":  "Bắc Âu",
    "Southern Europe":  "Nam Âu",
    "Eastern Europe":   "Đông Âu",
    "North America":    "Bắc Mỹ",
    "Central America":  "Trung Mỹ",
    "Caribbean":        "Caribe",
    "South America":    "Nam Mỹ",
    "Australasia":      "Úc & New Zealand",
    "Melanesia":        "Melanesia",
    "Polynesia":        "Polynesia",
    "Micronesia":       "Micronesia",
    "North Africa":     "Bắc Phi",
    "West Africa":      "Tây Phi",
    "East Africa":      "Đông Phi",
    "Central Africa":   "Trung Phi",
    "Southern Africa":  "Nam Phi",
}

CONTINENT_VN = {
    "Asia":        "Châu Á",
    "Europe":      "Châu Âu",
    "Americas":    "Châu Mỹ",
    "Africa":      "Châu Phi",
    "Oceania":     "Châu Đại Dương",
    "Middle East": "Trung Đông",
}


def main():
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        print("ERROR: set SUPABASE_URL + SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(1)

    sb = create_client(url, key)

    # Fetch tất cả ref_countries
    all_rows, page = [], 0
    while True:
        res = sb.table("ref_countries").select("code,name").range(page, page + 999).execute()
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < 1000:
            break
        page += 1000

    # Gom mọi thay đổi vào 1 bulk upsert (on_conflict=code) thay vì update từng dòng
    # → 212 HTTP request tuần tự (~20-40s) rút còn 1 request (<1s).
    upsert_data = []
    skipped = 0
    for row in all_rows:
        code = row["code"].upper().strip()
        if code not in GEO:
            skipped += 1
            continue
        continent, sub_region = GEO[code]
        # Kèm "name" (NOT NULL) để phần INSERT của upsert hợp lệ; ON CONFLICT chỉ ghi lại giá trị cũ.
        upsert_data.append({
            "code":       code,
            "name":       row.get("name") or code,
            "continent":  continent,
            "sub_region": sub_region,
        })

    if upsert_data:
        sb.table("ref_countries").upsert(upsert_data, on_conflict="code").execute()

    print(f"Done — updated: {len(upsert_data)}, no mapping: {skipped}")
    print(f"(Missing codes will keep NULL continent/sub_region)")


if __name__ == "__main__":
    main()
