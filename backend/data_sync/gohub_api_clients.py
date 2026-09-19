"""
Gohub API Client
Partner: gohub-cloud
Endpoints: GET/POST /products, GET/POST /skus, GET/POST /listings, GET/POST /items
"""

import os
import time
import threading
import concurrent.futures
import requests
import json
import dataclasses
from dataclasses import dataclass
from typing import Optional
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ─────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────
API_KEY = os.environ.get("API_KEY", "")

BASE_URL = "https://api-pm.space.gohub.com/api-pull/gohub-cloud"


# ─────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────
@dataclass
class Pagination:
    total: int
    page:  int
    limit: int

    def __str__(self):
        pages = -(-self.total // self.limit)
        return f"Page {self.page}/{pages} — {self.total} total items"


def _build(cls, d: dict):
    """Dựng dataclass từ dict API, chịu được trường THIẾU/THỪA.

    s201 (2026-09-19): API GoHub thôi trả một số trường (VD skus thiếu `expirations`) ⇒ `cls(**d)` ném
    TypeError "missing 1 required positional argument" và làm chết cả sync (không ai thấy vì các run cũ
    chết trước đó do 429/timeout). Trường thiếu → None (cột Supabase đều cho phép NULL); trường thừa bỏ qua.
    """
    return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class Product:
    tenant:                 str
    product_code:           str
    status:                 str
    type_of_sim:            str
    product_type:           str
    operator_code:          str
    vendor_code:            str
    purchase_type:          str
    source_type:            str
    sku_type:               str
    data_type:              str
    import_type:            str
    supported_countries:    str
    network_type:           str
    onsite_carrier:         str
    local_phone_number:     str
    hotspot:                str
    kyc_code:               str
    kyc_needed:             str
    top_up_options:         str
    date_created:           str
    last_modified_date:     str
    base_sim_esim_sku_code: Optional[str] = None
    daily_reset_time:       Optional[str] = None
    activation_time:        Optional[str] = None
    apn_original:           Optional[str] = None
    apn:                    Optional[str] = None
    local_number_country:   Optional[str] = None
    kyc_links:              Optional[str] = None
    activation:             Optional[str] = None
    unsupported_apps:       Optional[str] = None
    telco_perks:            Optional[str] = None
    note:                   Optional[str] = None
    data_plan_type:         Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "Product":
        return _build(cls, d)


@dataclass
class Sku:
    tenant:                     str
    sku_code:                   str
    product_code:               str
    status:                     str
    sim_esim:                   str
    product_type:               str
    throttle_speed:             str
    call:                       str
    expirations:                str
    currency:                   str
    day_amount:                 int
    day_amount_unit:            str
    data_amount:                float
    data_amount_unit:           str
    date_created:               str
    last_modified_date:         str
    # Nullable / optional
    frame:                      Optional[str]   = None
    datapack:                   Optional[str]   = None
    call_sms_details:           Optional[str]   = None
    vendor_sku:                 Optional[str]   = None
    vendor_sku_sim:             Optional[str]   = None
    original_cost:              Optional[float] = None
    reference_cost_vnd:         Optional[float] = None
    latest_cogs:                Optional[float] = None
    latest_cogs_currency:       Optional[str]   = None
    final_cogs_included_vat_vnd:Optional[float] = None
    final_cogs_usd:             Optional[float] = None
    wr_group:                   Optional[str]   = None

    @classmethod
    def from_dict(cls, d: dict) -> "Sku":
        return _build(cls, d)


@dataclass
class Listing:
    tenant:                         str
    listing_code:                   str
    reference_product_code:         str
    status:                         str
    listing_name_en:                str
    listing_name_vn:                str
    listing_type:                   str
    type_of_sim:                    str
    product_type:                   str
    network_operator:               str
    data_type_en:                   str
    data_type_vn:                   str
    category_code:                  str
    network_type:                   str
    hotspot_en:                     str
    hotspot_vn:                     str
    kyc_needed_en:                  str
    kyc_needed_vn:                  str
    expirations_en:                 int
    expirations_vn:                 int
    top_up_options_en:              str
    top_up_options_vn:              str
    special_activation_required_en: str
    special_activation_required_vn: str
    local_phone_number_en:          str
    local_phone_number_vn:          str
    local_phone_number_country:     str
    call_en:                        str
    call_vn:                        str
    apn:                            str
    date_created:                   str
    last_modified_date:             str
    daily_reset_time_en:            Optional[str] = None
    daily_reset_time_vn:            Optional[str] = None
    activation_time_en:             Optional[str] = None
    activation_time_vn:             Optional[str] = None
    kyc_links_en:                   Optional[str] = None
    kyc_links_vn:                   Optional[str] = None
    activation_en:                  Optional[str] = None
    activation_vn:                  Optional[str] = None
    activation_links_en:            Optional[str] = None
    activation_links_vn:            Optional[str] = None
    unsupported_apps_en:            Optional[str] = None
    unsupported_apps_vn:            Optional[str] = None
    telco_perks_en:                 Optional[str] = None
    telco_perks_vn:                 Optional[str] = None
    note_en:                        Optional[str] = None
    note_vn:                        Optional[str] = None
    call_sms_details_en:            Optional[str] = None
    call_sms_details_vn:            Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "Listing":
        return _build(cls, d)


@dataclass
class Item:
    tenant:           str
    item_code:        str
    alias:            str
    sku_code:         str
    listing_code:     str
    category_code:    str
    status:           str
    item_type:        str
    item_name_en:     str
    item_name_vn:     str
    day_amount:       int
    day_amount_unit:  str
    data_amount:      str
    data_amount_unit: str
    unitprice:        float
    currency:         str
    date_created:     str
    last_modified_date: str
    throttle_speed_en:  Optional[str] = None
    throttle_speed_vn:  Optional[str] = None
    call_en:            Optional[str] = None
    call_vn:            Optional[str] = None
    call_sms_details_en:Optional[str] = None
    call_sms_details_vn:Optional[str] = None
    sales_channel:      Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "Item":
        return _build(cls, d)


@dataclass
class ApiResponse:
    status:     str
    code:       int
    message:    str
    items:      list
    pagination: Pagination


# ─────────────────────────────────────────────────────────
# Client
# ─────────────────────────────────────────────────────────
class _TimeoutAdapter(HTTPAdapter):
    """requests không có timeout mặc định → 1 kết nối treo làm cả job đứng tới hết timeout GitHub Actions."""
    def send(self, request, **kwargs):
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = (10, 60)
        return super().send(request, **kwargs)


class GohubClient:
    # Lỗi tạm thời mà vòng thử lại cấp trang (ngoài urllib3.Retry) sẽ thử tiếp thay vì bỏ cả job.
    _TRANSIENT = (requests.exceptions.RetryError, requests.exceptions.ConnectionError,
                  requests.exceptions.Timeout, requests.exceptions.HTTPError)
    PAGE_ATTEMPTS = 5
    RETRY_DELAY_BASE = 20   # giây; chờ = BASE × số lần thử (tối đa 120s)

    def __init__(self, api_key: str = API_KEY):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        })
        # Fix s198+11 (2026-09-15): GoHub API rate-limit (429) từ 2026-07-21 làm sync crash giữa chừng
        # mỗi lần chạy (verify qua GitHub Actions run log — HTTPError 429 tại /skus, 4 resource fetch
        # song song ThreadPoolExecutor(max_workers=4) cộng dồn request rate). Retry tự động, tôn trọng
        # header Retry-After nếu GoHub API có trả về, backoff luỹ thừa nếu không.
        # s201 (2026-09-19): 502 kéo dài (run 09-17) vượt hết 6 lần retry này → thêm vòng thử lại cấp trang
        # (_fetch_page) + cooldown dùng chung giữa các luồng, xem _fetch_all.
        retry = Retry(
            total=4, backoff_factor=2,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=frozenset(["GET", "POST"]),
            respect_retry_after_header=True,
        )
        adapter = _TimeoutAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self._cooldown_until = 0.0
        self._cooldown_lock = threading.Lock()

    # ── Cooldown dùng chung: 1 luồng dính lỗi tạm thời thì mọi luồng khác chờ, tránh dồn thêm request ──
    def _wait_cooldown(self):
        while True:
            with self._cooldown_lock:
                left = self._cooldown_until - time.monotonic()
            if left <= 0:
                return
            time.sleep(min(left, 5))

    def _set_cooldown(self, seconds: float):
        with self._cooldown_lock:
            self._cooldown_until = max(self._cooldown_until, time.monotonic() + seconds)

    def _fetch_page(self, fetch_page_fn, page: int, limit: int, label: str):
        last_err = None
        for attempt in range(1, self.PAGE_ATTEMPTS + 1):
            self._wait_cooldown()
            try:
                return fetch_page_fn(page=page, limit=limit)
            except self._TRANSIENT as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                # 4xx thật (trừ 429) là lỗi cấu hình/quyền — thử lại vô ích
                if status is not None and 400 <= status < 500 and status != 429:
                    raise
                last_err = e
                delay = min(self.RETRY_DELAY_BASE * attempt, 120)
                self._set_cooldown(delay)
                print(f"  [{label}] page {page} lỗi tạm thời ({type(e).__name__}) — thử lại {attempt}/{self.PAGE_ATTEMPTS} sau {delay}s",
                      flush=True)
        raise last_err

    # ── Internal: parse response ───────────────────────────
    def _parse(self, resp: requests.Response, model) -> ApiResponse:
        resp.raise_for_status()
        raw = resp.json()
        items      = [model.from_dict(item) for item in raw["data"]["items"]]
        pagination = Pagination(**raw["data"]["pagination"])
        return ApiResponse(
            status=raw["status"], code=raw["code"],
            message=raw["message"], items=items, pagination=pagination,
        )

    # ── Internal: auto-paginate ────────────────────────────
    def _fetch_all(self, fetch_page_fn, limit: int = 1000, label: str = "", workers: int = 1) -> list:
        """Tải toàn bộ các trang.

        s201 (2026-09-19): server GoHub API cắt cứng 200 dòng/trang dù xin limit=1000 (log run 09-18: "+200").
        Client cũ tải TUẦN TỰ từng trang (items 233k dòng = 1.167 request × ~4,7s ≈ 82 phút → hết timeout
        90' của GitHub Actions). Bản này: lấy trang 1 để biết page size THỰC, rồi tải các trang còn lại song
        song có giới hạn (workers), ghép lại đúng thứ tự trang và kiểm tổng số dòng khớp `pagination.total`.
        """
        label = label or "api"
        first = self._fetch_page(fetch_page_fn, 1, limit, label)
        total = first.pagination.total
        page_size = len(first.items)
        if total <= page_size or page_size == 0:
            print(f"  [{label}] {len(first.items):,}/{total:,} dòng (1 trang)", flush=True)
            return list(first.items)

        total_pages = -(-total // page_size)
        print(f"  [{label}] tổng {total:,} dòng · {page_size}/trang · {total_pages} trang · {workers} luồng", flush=True)
        pages: dict[int, list] = {1: first.items}
        done = 1
        started = time.monotonic()

        def _get(p: int):
            # limit = page_size để offset của server nhất quán ((p-1)*page_size) với trang 1
            return p, self._fetch_page(fetch_page_fn, p, page_size, label).items

        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            for p, rows in ex.map(_get, range(2, total_pages + 1)):
                pages[p] = rows
                done += 1
                if done % 25 == 0 or done == total_pages:
                    el = time.monotonic() - started
                    eta = el / max(done - 1, 1) * (total_pages - done)
                    print(f"  [{label}] {done}/{total_pages} trang — đã {el/60:.1f}′, còn ~{eta/60:.1f}′", flush=True)

        all_items = [it for p in sorted(pages) for it in pages[p]]
        if len(all_items) != total:
            raise RuntimeError(f"[{label}] tải thiếu/thừa dòng: nhận {len(all_items):,} ≠ total {total:,}")
        return all_items

    # ══════════════════════════════════════════════════════
    # PRODUCTS
    # ══════════════════════════════════════════════════════

    def get_products(
        self,
        page:          int           = 1,
        limit:         int           = 1000,
        tenant:        Optional[str] = None,
        product_code:  Optional[str] = None,
        product_codes: Optional[list]= None,
        status:        Optional[str] = None,
    ) -> ApiResponse:
        params: dict = {"page": page, "limit": limit}
        if tenant:        params["tenant"]       = tenant
        if product_code:  params["productCode"]  = product_code
        if product_codes: params["productCodes"] = ",".join(product_codes)
        if status:        params["status"]       = status
        resp = self.session.get(f"{self.base_url}/products", params=params)
        return self._parse(resp, Product)

    def post_products(
        self,
        page:          int           = 1,
        limit:         int           = 1000,
        tenant:        Optional[str] = None,
        product_codes: Optional[list]= None,
        status:        Optional[str] = None,
    ) -> ApiResponse:
        body: dict = {"page": page, "limit": limit}
        if tenant:        body["tenant"]       = tenant
        if product_codes: body["productCodes"] = product_codes
        if status:        body["status"]       = status
        resp = self.session.post(f"{self.base_url}/products", json=body)
        return self._parse(resp, Product)

    def get_all_products(self, tenant=None, status=None, workers=1) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_products(page=page, limit=limit, tenant=tenant, status=status),
            label="products", workers=workers
        )

    def post_all_products(self, tenant=None, product_codes=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.post_products(page=page, limit=limit, tenant=tenant,
                                                   product_codes=product_codes, status=status)
        )

    # ══════════════════════════════════════════════════════
    # SKUS
    # ══════════════════════════════════════════════════════

    def get_skus(
        self,
        page:          int           = 1,
        limit:         int           = 1000,
        tenant:        Optional[str] = None,
        sku_code:      Optional[str] = None,
        sku_codes:     Optional[list]= None,
        product_codes: Optional[list]= None,
        status:        Optional[str] = None,
    ) -> ApiResponse:
        params: dict = {"page": page, "limit": limit}
        if tenant:        params["tenant"]       = tenant
        if sku_code:      params["skuCode"]      = sku_code
        if sku_codes:     params["skuCodes"]     = ",".join(sku_codes)
        if product_codes: params["productCodes"] = ",".join(product_codes)
        if status:        params["status"]       = status
        resp = self.session.get(f"{self.base_url}/skus", params=params)
        return self._parse(resp, Sku)

    def post_skus(
        self,
        page:          int           = 1,
        limit:         int           = 1000,
        tenant:        Optional[str] = None,
        sku_codes:     Optional[list]= None,
        product_codes: Optional[list]= None,
        status:        Optional[str] = None,
    ) -> ApiResponse:
        body: dict = {"page": page, "limit": limit}
        if tenant:        body["tenant"]       = tenant
        if sku_codes:     body["skuCodes"]     = sku_codes
        if product_codes: body["productCodes"] = product_codes
        if status:        body["status"]       = status
        resp = self.session.post(f"{self.base_url}/skus", json=body)
        return self._parse(resp, Sku)

    def get_all_skus(self, tenant=None, sku_codes=None, product_codes=None, status=None, workers=1) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_skus(page=page, limit=limit, tenant=tenant,
                                              sku_codes=sku_codes, product_codes=product_codes,
                                              status=status),
            label="skus", workers=workers
        )

    def post_all_skus(self, tenant=None, sku_codes=None, product_codes=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.post_skus(page=page, limit=limit, tenant=tenant,
                                               sku_codes=sku_codes, product_codes=product_codes,
                                               status=status)
        )

    # ══════════════════════════════════════════════════════
    # LISTINGS
    # ══════════════════════════════════════════════════════

    def get_listings(
        self,
        page:               int           = 1,
        limit:              int           = 1000,
        tenant:             Optional[str] = None,
        listing_type_code:  Optional[str] = None,
        status:             Optional[str] = None,
    ) -> ApiResponse:
        params: dict = {"page": page, "limit": limit}
        if tenant:            params["tenant"]          = tenant
        if listing_type_code: params["listingTypeCode"] = listing_type_code
        if status:            params["status"]          = status
        resp = self.session.get(f"{self.base_url}/listings", params=params)
        return self._parse(resp, Listing)

    def post_listings(
        self,
        page:          int           = 1,
        limit:         int           = 1000,
        tenant:        Optional[str] = None,
        listing_codes: Optional[list]= None,
        product_codes: Optional[list]= None,
        status:        Optional[str] = None,
    ) -> ApiResponse:
        body: dict = {"page": page, "limit": limit}
        if tenant:        body["tenant"]       = tenant
        if listing_codes: body["listingCodes"] = listing_codes
        if product_codes: body["productCodes"] = product_codes
        if status:        body["status"]       = status
        resp = self.session.post(f"{self.base_url}/listings", json=body)
        return self._parse(resp, Listing)

    def get_all_listings(self, tenant=None, listing_type_code=None, status=None, workers=1) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_listings(page=page, limit=limit, tenant=tenant,
                                                  listing_type_code=listing_type_code, status=status),
            label="listings", workers=workers
        )

    def post_all_listings(self, tenant=None, listing_codes=None, product_codes=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.post_listings(page=page, limit=limit, tenant=tenant,
                                                   listing_codes=listing_codes,
                                                   product_codes=product_codes, status=status)
        )

    # ══════════════════════════════════════════════════════
    # ITEMS
    # ══════════════════════════════════════════════════════

    def get_items(
        self,
        page:           int           = 1,
        limit:          int           = 1000,
        tenant:         Optional[str] = None,
        item_type_code: Optional[str] = None,
        status:         Optional[str] = None,
    ) -> ApiResponse:
        params: dict = {"page": page, "limit": limit}
        if tenant:         params["tenant"]       = tenant
        if item_type_code: params["itemTypeCode"] = item_type_code
        if status:         params["status"]       = status
        resp = self.session.get(f"{self.base_url}/items", params=params)
        return self._parse(resp, Item)

    def post_items(
        self,
        page:          int           = 1,
        limit:         int           = 1000,
        tenant:        Optional[str] = None,
        item_codes:    Optional[list]= None,
        listing_codes: Optional[list]= None,
        sku_codes:     Optional[list]= None,
    ) -> ApiResponse:
        body: dict = {"page": page, "limit": limit}
        if tenant:        body["tenant"]       = tenant
        if item_codes:    body["itemCodes"]    = item_codes
        if listing_codes: body["listingCodes"] = listing_codes
        if sku_codes:     body["skuCodes"]     = sku_codes
        resp = self.session.post(f"{self.base_url}/items", json=body)
        return self._parse(resp, Item)

    def get_all_items(self, tenant=None, item_type_code=None, status=None, workers=1) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_items(page=page, limit=limit, tenant=tenant,
                                               item_type_code=item_type_code, status=status),
            label="items", workers=workers
        )

    def post_all_items(self, tenant=None, item_codes=None, listing_codes=None, sku_codes=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.post_items(page=page, limit=limit, tenant=tenant,
                                                item_codes=item_codes, listing_codes=listing_codes,
                                                sku_codes=sku_codes)
        )


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────
def to_json(items: list, path: str):
    with open(path, "w", encoding="utf-8") as f:
        json.dump([dataclasses.asdict(i) for i in items], f, ensure_ascii=False, indent=2)
    print(f"✓ Đã lưu {len(items)} items → {path}")


def to_csv(items: list, path: str):
    import csv
    if not items: return
    fields = list(dataclasses.asdict(items[0]).keys())
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows([dataclasses.asdict(i) for i in items])
    print(f"✓ Đã lưu {len(items)} items → {path}")


# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    client = GohubClient()

    print("─── POST /products ───")
    r = client.post_products(page=1, limit=10, tenant="VN")
    print(f"{r.status} ({r.code}) · {r.pagination}")

    print("\n─── POST /skus ───")
    r2 = client.post_skus(page=1, limit=10, tenant="VN")
    print(f"{r2.status} ({r2.code}) · {r2.pagination}")

    print("\n─── GET /listings ───")
    r3 = client.get_listings(page=1, limit=10, tenant="VN")
    print(f"{r3.status} ({r3.code}) · {r3.pagination}")

    print("\n─── GET /items ───")
    r4 = client.get_items(page=1, limit=10, tenant="VN")
    print(f"{r4.status} ({r4.code}) · {r4.pagination}")