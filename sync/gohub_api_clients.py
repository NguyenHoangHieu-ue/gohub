"""
Gohub API Client
Partner: gohub-cloud
Endpoints: GET/POST /products, GET/POST /skus, GET/POST /listings, GET/POST /items
"""

import os
import requests
import json
import dataclasses
from dataclasses import dataclass
from typing import Optional

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
class Listing:
    tenant:                         str
    listing_code:                   str
    listing_ref:                    str
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
    esim_type_en:                   str
    esim_type_vn:                   str
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
    supported_country_name_en:      str
    supported_country_name_vn:      str
    category_name_en:               str
    category_name_vn:               str
    apn:                            str
    date_created:                   str
    last_modified_date:             str
    price_list:                     Optional[str] = None
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
    raw_unsupported_apps:           Optional[str] = None
    unsupported_apps_en:            Optional[str] = None
    unsupported_apps_vn:            Optional[str] = None
    unsupported_apps_highlight_en:  Optional[str] = None
    unsupported_apps_highlight_vn:  Optional[str] = None
    telco_perks_en:                 Optional[str] = None
    telco_perks_vn:                 Optional[str] = None
    raw_note:                       Optional[str] = None
    raw_note_vn:                    Optional[str] = None
    note_en:                        Optional[str] = None
    note_en_backup:                 Optional[str] = None
    note_vn:                        Optional[str] = None
    note_vn_backup:                 Optional[str] = None
    call_sms_details_en:            Optional[str] = None
    call_sms_details_vn:            Optional[str] = None
    change_apn_note_en:             Optional[str] = None
    change_apn_note_vn:             Optional[str] = None
    change_apn_links_en:            Optional[str] = None
    change_apn_links_vn:            Optional[str] = None
    kyc_pdf_template_code:          Optional[str] = None
    activation_pdf_template_code:   Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "Listing":
        known = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class Item:
    tenant:           str
    item_code:        str
    item_ref:         str
    alias:            str
    sku_code:         str
    listing_code:     str
    category_code:    str
    status:           str
    item_type:        str
    price_list:       str
    item_name_en:     str
    item_name_vn:     str
    day_amount:       int
    day_amount_unit:  str
    data_amount:      str
    data_amount_unit: str
    channel:          str
    pricelistcode:    str
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
    def __init__(self, api_key: str = API_KEY):
        self.base_url = BASE_URL
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

    def get_all_skus(self, tenant=None, sku_codes=None, product_codes=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_skus(page=page, limit=limit, tenant=tenant,
                                              sku_codes=sku_codes, product_codes=product_codes,
                                              status=status)
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

    def get_all_listings(self, tenant=None, listing_type_code=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_listings(page=page, limit=limit, tenant=tenant,
                                                  listing_type_code=listing_type_code, status=status)
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

    def get_all_items(self, tenant=None, item_type_code=None, status=None) -> list:
        return self._fetch_all(
            lambda page, limit: self.get_items(page=page, limit=limit, tenant=tenant,
                                               item_type_code=item_type_code, status=status)
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
