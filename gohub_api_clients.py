"""
Gohub API Client
Partner: gohub-cloud
Endpoints: GET/POST /products, GET/POST /skus
"""

import requests
import json
import dataclasses
from dataclasses import dataclass
from typing import Optional


# ─────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────
#API_KEY = "a99e6a939875a9be06f32ea767557d4ac7e019c6064b44569ba4961054d51691"
API_KEY = st.secrets.get("API_KEY", "fallback_key_local")

BASE_URLS = {
    "production": "https://api-pm.space.gohub.com/api-pull/gohub-cloud",
    "staging":    "https://api-pm.stg-space.gohub.com/api-pull/gohub-cloud",
}


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


@dataclass
class Product:
    tenant:                 str
    product_code:           str
    product_ref:            str
    status:                 str
    type_of_sim:            str
    product_type:           str
    operator_code:          str
    vendor_code:            str
    purchase_type:          str
    gc_purchase_type:       str
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
        known = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class Sku:
    tenant:                     str
    sku_code:                   str
    sku_ref:                    str
    product_code:               str
    status:                     str
    sim_esim:                   str
    product_type:               str
    parents:                    str
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
        known = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in known})


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
class GohubClient:
    def __init__(self, env: str = "production", api_key: str = API_KEY):
        assert env in BASE_URLS, "env phải là 'staging' hoặc 'production'"
        self.base_url = BASE_URLS[env]
        self.env = env
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        })

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
    def _fetch_all(self, fetch_page_fn, limit: int = 1000) -> list:
        all_items, page = [], 1
        while True:
            r = fetch_page_fn(page=page, limit=limit)
            all_items.extend(r.items)
            total_pages = -(-r.pagination.total // limit)
            print(f"  Page {page}/{total_pages} — +{len(r.items)} (tổng: {len(all_items)}/{r.pagination.total})")
            if len(all_items) >= r.pagination.total:
                break
            page += 1
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

    def get_all_products(self, tenant=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_products(page=page, limit=limit, tenant=tenant, status=status)
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

    def get_all_skus(self, tenant=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_skus(page=page, limit=limit, tenant=tenant, status=status)
        )

    def post_all_skus(self, tenant=None, sku_codes=None, product_codes=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.post_skus(page=page, limit=limit, tenant=tenant,
                                               sku_codes=sku_codes, product_codes=product_codes,
                                               status=status)
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
    client = GohubClient(env="production")

    # Products
    print("─── POST /products ───")
    r = client.post_products(page=1, limit=10, tenant="VN")
    print(f"{r.status} ({r.code}) · {r.pagination}")

    # SKUs
    print("\n─── POST /skus ───")
    r2 = client.post_skus(page=1, limit=10, tenant="VN")
    print(f"{r2.status} ({r2.code}) · {r2.pagination}")
