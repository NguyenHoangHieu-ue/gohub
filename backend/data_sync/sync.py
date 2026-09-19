"""
Sync GoHub API data → Supabase.
GitHub Actions: chạy tự động mỗi ngày lúc 01:00 UTC
Local: cd backend/data_sync && python sync.py [core|items|all]  (cần set env vars API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)
CORE = products/skus/listings (nhanh, ghi ngay); ITEMS = 233k dòng (chậm) chạy job riêng — xem .github/workflows/sync.yml
"""
import os
import time
import dataclasses
from datetime import datetime, timezone
from supabase import create_client
from gohub_api_clients import GohubClient

API_KEY      = os.environ["API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

CHUNK      = 500
FULL_TYPES = {"C", "E", "1", "2"}

def _is_timeout(e: Exception) -> bool:
    """Supabase/PostgREST: 57014 = statement timeout; cũng gom lỗi mạng/5xx tạm thời."""
    txt = f"{getattr(e, 'code', '')} {e}".lower()
    return "57014" in txt or "statement timeout" in txt or "timeout" in txt or "timed out" in txt \
        or "502" in txt or "503" in txt or "504" in txt or "connection" in txt


def _upsert_batch(sb, table: str, batch: list[dict], pk: str, depth: int = 0):
    """Upsert 1 khối; nếu Supabase báo timeout thì CHIA ĐÔI khối rồi thử lại (tối đa 6 tầng ≈ 1/64 khối gốc).

    s201 (2026-09-19): run items chết vì `canceling statement due to statement timeout` (57014) ở khối 500 dòng
    của bảng ~230k dòng. Nhỏ hơn thì qua; upsert idempotent nên thử lại an toàn.
    """
    try:
        sb.table(table).upsert(batch, on_conflict=pk).execute()
    except Exception as e:  # noqa: BLE001
        if not _is_timeout(e) or depth >= 6:
            raise
        if len(batch) > 1:
            mid = len(batch) // 2
            print(f"  [{table}] timeout khi ghi {len(batch)} dòng — chia đôi (tầng {depth + 1})", flush=True)
            _upsert_batch(sb, table, batch[:mid], pk, depth + 1)
            _upsert_batch(sb, table, batch[mid:], pk, depth + 1)
        else:
            time.sleep(min(5 * (depth + 1), 30))
            _upsert_batch(sb, table, batch, pk, depth + 1)


def upsert(sb, table: str, rows: list[dict], pk: str, chunk: int = CHUNK):
    now = datetime.now(timezone.utc).isoformat()
    for i in range(0, len(rows), chunk):
        batch = [{**r, "synced_at": now} for r in rows[i:i + chunk]]
        _upsert_batch(sb, table, batch, pk)

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
        "data_amount,data_amount_unit,day_amount,expirations,throttle_speed,call,"
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
            "is_daily":             len(code) >= 8 and code[7] in ("A","B","P","Z"),  # A/B=Daily Unlimited, P=Daily throttle<2M, Z=Daily no-throttle
            "day_amount":           s.get("day_amount"),
            "expirations":          s.get("expirations"),
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

def detect_sku_changes(old_skus: dict, new_rows: list) -> tuple:
    """So sánh snapshot DB cũ vs dữ liệu mới từ API."""
    non_price = []
    price_changes = []

    for row in new_rows:
        sku = row.get("sku_code") or ""
        if not sku:
            continue
        pcode  = row.get("product_code") or sku[:8]
        status = row.get("status") or ""
        old    = old_skus.get(sku)

        if old is None:
            non_price.append({"sku_code": sku, "product_code": pcode, "status": status, "changed": "Mới"})
        else:
            old_st = old.get("status") or ""
            if old_st != status:
                if status == "Active" and old_st != "Active":
                    label = "Kích hoạt lại"
                elif status != "Active" and old_st == "Active":
                    label = "Ngưng"
                else:
                    label = f"{old_st}→{status}"
                non_price.append({"sku_code": sku, "product_code": pcode, "status": status, "changed": label})

            old_cogs = old.get("latest_cogs")
            new_cogs = row.get("latest_cogs")
            if old_cogs is not None and new_cogs is not None and old_cogs != new_cogs:
                curr = row.get("latest_cogs_currency") or ""
                price_changes.append({
                    "sku_code": sku, "product_code": pcode, "status": status,
                    "changed": f"Giá: {old_cogs}→{new_cogs} {curr}".strip()
                })

    return non_price, price_changes


def insert_sync_notifications(sb, non_price: list, price_changes: list):
    """Insert thông báo sau sync vào bảng notifications."""
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")

    if non_price:
        new_c  = sum(1 for c in non_price if c["changed"] == "Mới")
        stop_c = sum(1 for c in non_price if c["changed"] == "Ngưng")
        back_c = sum(1 for c in non_price if c["changed"] == "Kích hoạt lại")
        other_c = len(non_price) - new_c - stop_c - back_c

        parts = []
        if new_c:   parts.append(f"+{new_c} mới")
        if stop_c:  parts.append(f"{stop_c} ngưng")
        if back_c:  parts.append(f"{back_c} kích hoạt lại")
        if other_c: parts.append(f"{other_c} khác")

        sb.table("notifications").insert({
            "type": "sync",
            "title": f"Sync {now_str} — " + ", ".join(parts),
            "body": f"{len(non_price)} thay đổi trạng thái SKU",
            "data": {
                "changes": non_price[:50],
                "summary": {"new": new_c, "discontinued": stop_c,
                            "reactivated": back_c, "total": len(non_price)},
            },
            "visibility": "all",
            "sent_to_lark": False,
        }).execute()
        print(f"[notify] SKU changes inserted (new={new_c}, stop={stop_c}, back={back_c})", flush=True)

    if price_changes:
        sb.table("notifications").insert({
            "type": "price_change",
            "title": f"Sync {now_str} — {len(price_changes)} SKU đổi giá",
            "body": f"{len(price_changes)} SKU thay đổi COGS (chỉ admin/manager)",
            "data": {
                "changes": price_changes[:50],
                "summary": {"price_changed": len(price_changes)},
            },
            "visibility": "admin_manager",
            "sent_to_lark": False,
        }).execute()
        print(f"[notify] Price changes inserted ({len(price_changes)})", flush=True)

    if not non_price and not price_changes:
        print("[notify] No changes — no notification.", flush=True)


# Cột bỏ khỏi bản ghi trước khi upsert (không có trong schema Supabase / nhạy cảm)
DROP_COLS = {
    "skus":     {"original_cost", "reference_cost_vnd",
                 "final_cogs_included_vat_vnd", "final_cogs_usd", "wr_group"},
    "products": {"data_plan_type"},
}

# Item 4 (Phase 1): listings — cột NÒNG CỐT giữ dạng cột; phần còn lại gom vào JSONB `metadata`.
# Vẫn GHI song song cột phẳng (rollback được) → chỉ THÊM key metadata. Khớp backfill v21_listings_metadata.sql.
LISTING_CORE = {"listing_code", "reference_product_code", "tenant", "status",
                "listing_type", "type_of_sim", "product_type", "category_code",
                "listing_name_en", "listing_name_vn"}

# Số luồng tải trang song song mỗi bảng (server GoHub API cắt 200 dòng/trang). Chỉnh qua env nếu bị 429.
CORE_PAGE_WORKERS  = int(os.environ.get("GOHUB_CORE_WORKERS", "3"))
ITEMS_PAGE_WORKERS = int(os.environ.get("GOHUB_ITEMS_WORKERS", "4"))  # server tuần tự hoá: >4 luồng không nhanh hơn (đo 09-19: ~10 trang/phút)


def _prepare_rows(table: str, rows: list[dict]) -> list[dict]:
    if table == "listings":
        rows = [{**r, "metadata": {k: v for k, v in r.items() if k not in LISTING_CORE}} for r in rows]
    if table in DROP_COLS:
        drop = DROP_COLS[table]
        rows = [{k: v for k, v in r.items() if k not in drop} for r in rows]
    return rows


def _sync_table(sb, table: str, rows: list[dict], pk: str):
    rows = _prepare_rows(table, rows)
    print(f"[{table}] Upserting {len(rows):,} rows...", flush=True)
    upsert(sb, table, rows, pk)
    sb.table("sync_log").upsert(
        {"table_name": table, "last_sync": datetime.now(timezone.utc).isoformat(),
         "record_count": len(rows)},
        on_conflict="table_name",
    ).execute()
    print(f"[{table}] Done ✓", flush=True)


def run_core(client, sb) -> dict:
    """Giai đoạn CORE: products → skus → listings (~vài phút).

    s201 (2026-09-19): trước đây tải CẢ 4 bảng (kể cả items 233k dòng ≈ 82 phút) rồi mới upsert → items
    chậm/chết thì products/skus/listings cũng không được ghi (Supabase đóng băng ở 2026-07-20). Nay mỗi
    bảng được upsert NGAY khi tải xong, items tách sang run_items() chạy job riêng.
    """
    # Snapshot SKU state trước khi sync (để detect changes)
    print("[changes] Snapshotting SKU state...", flush=True)
    old_skus = {
        r["sku_code"]: {
            "status": r.get("status"), "product_code": r.get("product_code"),
            "latest_cogs": r.get("latest_cogs"), "latest_cogs_currency": r.get("latest_cogs_currency"),
        }
        for r in fetch_all_rows(sb, "skus",
            "sku_code,product_code,status,latest_cogs,latest_cogs_currency")
    }

    tasks = [
        ("products", client.get_all_products, "product_code"),
        ("skus",     client.get_all_skus,     "sku_code"),
        ("listings", client.get_all_listings, "listing_code"),
    ]
    counts: dict[str, int] = {}
    new_sku_rows: list[dict] = []
    # Thứ tự FK: products → skus → listings. Tải tuần tự từng bảng (mỗi bảng đã song song theo trang)
    # để tổng số request đồng thời ≤ CORE_PAGE_WORKERS, tránh 429.
    for table, fetch_fn, pk in tasks:
        print(f"[{table}] Fetching...", flush=True)
        rows = [dataclasses.asdict(r) for r in fetch_fn(workers=CORE_PAGE_WORKERS)]
        print(f"[{table}] Fetched {len(rows):,} rows", flush=True)
        if table == "skus":
            new_sku_rows = rows  # raw (có latest_cogs) để detect changes
        _sync_table(sb, table, rows, pk)
        counts[table] = len(rows)

    sync_sku_catalog(sb)
    sync_ncc_exist(sb)

    # Detect changes + insert notifications
    if new_sku_rows:
        non_price, price_ch = detect_sku_changes(old_skus, new_sku_rows)
        insert_sync_notifications(sb, non_price, price_ch)
    return counts


ITEMS_UPSERT_CHUNK = int(os.environ.get("GOHUB_ITEMS_UPSERT_CHUNK", "200"))


def run_items(client, sb) -> dict:
    """Giai đoạn ITEMS (233k dòng, chậm nhất) — chạy độc lập sau CORE.

    Ghi THEO TỪNG KHỐI ngay khi tải xong (sink) thay vì tải hết rồi mới ghi: fetch mất ~100', nếu ghi ở cuối
    mà lỗi thì mất trắng (run 2026-09-19). Nay lỗi giữa chừng vẫn giữ phần đã ghi (upsert idempotent).
    Bảng ~230k dòng nên khối ghi nhỏ (200) để không chạm statement timeout của Supabase.
    """
    print("[items] Fetching + upserting theo khối...", flush=True)
    written = 0

    def sink(objs):
        nonlocal written
        rows = _prepare_rows("items", [dataclasses.asdict(r) for r in objs])
        upsert(sb, "items", rows, "item_code", chunk=ITEMS_UPSERT_CHUNK)
        written += len(rows)
        print(f"[items] đã ghi {written:,} dòng", flush=True)

    client.get_all_items(workers=ITEMS_PAGE_WORKERS, sink=sink)
    sb.table("sync_log").upsert(
        {"table_name": "items", "last_sync": datetime.now(timezone.utc).isoformat(), "record_count": written},
        on_conflict="table_name",
    ).execute()
    print(f"[items] Done ✓ ({written:,} dòng)", flush=True)
    return {"items": written}


def main(phase: str = "all") -> dict:
    client = GohubClient(api_key=API_KEY)
    sb     = create_client(SUPABASE_URL, SUPABASE_KEY)
    counts: dict[str, int] = {}
    if phase in ("core", "all"):
        counts.update(run_core(client, sb))
    if phase in ("items", "all"):
        counts.update(run_items(client, sb))
    return counts

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
    # Fix s198+11 (2026-09-15): Hiếu báo "không biết nó có lỗi hay không" — trước đây script crash (VD
    # 429 rate-limit GoHub API, xem gohub_api_clients.py) chỉ có GitHub Actions run đỏ, không ai xem log
    # đó mỗi ngày. Bắt lỗi ở đây, ghi thẳng vào bảng notifications (hiện trên chuông "Thông báo" sidebar
    # Intel, mọi role admin/manager thấy ngay khi mở web) — rồi re-raise để GitHub Actions vẫn báo failed
    # như cũ (không che giấu lỗi khỏi CI).
    import sys
    PHASE = sys.argv[1] if len(sys.argv) > 1 else "all"
    if PHASE not in ("core", "items", "all"):
        raise SystemExit(f"phase không hợp lệ: {PHASE} (core | items | all)")
    PHASE_LABEL = {"core": "products/skus/listings", "items": "items", "all": "toàn bộ"}[PHASE]
    try:
        counts = main(PHASE)
        now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
        body = " · ".join(f"{tbl}: {n:,}" for tbl, n in counts.items())
        try:
            sb_ok = create_client(SUPABASE_URL, SUPABASE_KEY)
            sb_ok.table("notifications").insert({
                "type": "success",
                "title": f"✅ Sync GoHub API ({PHASE_LABEL}) thành công — {now_str} UTC",
                "body": body,
                "data": {"counts": counts},
                "visibility": "admin_manager",
                "sent_to_lark": False,
            }).execute()
        except Exception as notify_err:
            print(f"[WARN] Không ghi được notification thành công: {notify_err}", flush=True)
    except Exception as e:
        import traceback
        err_msg = f"{type(e).__name__}: {e}"
        print(f"[FATAL] Sync {PHASE_LABEL} thất bại: {err_msg}", flush=True)
        traceback.print_exc()
        try:
            now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
            sb_err = create_client(SUPABASE_URL, SUPABASE_KEY)
            sb_err.table("notifications").insert({
                "type": "error",
                "title": f"❌ Sync GoHub API ({PHASE_LABEL}) thất bại — {now_str} UTC",
                "body": err_msg[:500],
                "data": {"error": err_msg},
                "visibility": "admin_manager",
                "sent_to_lark": False,
            }).execute()
        except Exception as notify_err:
            print(f"[FATAL] Không ghi được notification lỗi: {notify_err}", flush=True)
        raise
