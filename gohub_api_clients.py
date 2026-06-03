"""
Gohub API Client
Partner: bao-test | API: gohub-cloud
"""

import requests
import json
import dataclasses
from dataclasses import dataclass
from typing import Optional

# ─────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────
API_KEY = "0e44b4d7017cc7b5be349df4cfa42b112b12bccf471e213534ea0507ce9098d1"

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
        pages = -(-self.total // self.limit)  # ceiling division
        return f"Page {self.page}/{pages} — {self.total} total items"


@dataclass
class Product:
    # Required fields
    tenant:              str
    product_code:        str
    product_ref:         str
    status:              str
    type_of_sim:         str
    product_type:        str
    operator_code:       str
    vendor_code:         str
    purchase_type:       str
    gc_purchase_type:    str
    source_type:         str
    sku_type:            str
    data_type:           str
    import_type:         str
    supported_countries: str
    network_type:        str
    onsite_carrier:      str
    local_phone_number:  str
    hotspot:             str
    kyc_code:            str
    kyc_needed:          str
    top_up_options:      str
    date_created:        str
    last_modified_date:  str
    # Nullable fields
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
class ProductsResponse:
    status:     str
    code:       int
    message:    str
    items:      list
    pagination: Pagination


# ─────────────────────────────────────────────────────────
# Client
# ─────────────────────────────────────────────────────────
class GohubClient:
    def __init__(self, env: str = "production"):
        assert env in BASE_URLS, "env phải là 'staging' hoặc 'production'"
        self.base_url = BASE_URLS[env]
        self.env = env
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type":  "application/json",
        })

    # ── GET /products ──────────────────────────────────────
    def get_products(
        self,
        page:          int           = 1,
        limit:         int           = 100,       # max 1000
        tenant:        Optional[str] = None,      # "VN" | "US"
        product_code:  Optional[str] = None,      # filter contains
        product_codes: Optional[list]= None,      # ["P001","P002"]
        status:        Optional[str] = None,      # "Active" | ...
    ) -> ProductsResponse:
        params: dict = {"page": page, "limit": limit}
        if tenant:        params["tenant"]       = tenant
        if product_code:  params["productCode"]  = product_code
        if product_codes: params["productCodes"] = ",".join(product_codes)
        if status:        params["status"]       = status

        resp = self.session.get(f"{self.base_url}/products", params=params)
        resp.raise_for_status()
        raw = resp.json()

        items      = [Product.from_dict(item) for item in raw["data"]["items"]]
        pagination = Pagination(**raw["data"]["pagination"])

        return ProductsResponse(
            status     = raw["status"],
            code       = raw["code"],
            message    = raw["message"],
            items      = items,
            pagination = pagination,
        )

    # ── POST /products ────────────────────────────────────
    def post_products(
        self,
        page:          int           = 1,
        limit:         int           = 100,       # max 1000
        tenant:        Optional[str] = None,      # "VN" | "US"
        product_codes: Optional[list]= None,      # ["P001","P002"]
        status:        Optional[str] = None,      # "ACTIVE" | ...
    ) -> ProductsResponse:
        body: dict = {"page": page, "limit": limit}
        if tenant:        body["tenant"]       = tenant
        if product_codes: body["productCodes"] = product_codes
        if status:        body["status"]       = status

        resp = self.session.post(f"{self.base_url}/products", json=body)
        resp.raise_for_status()
        raw = resp.json()

        items      = [Product.from_dict(item) for item in raw["data"]["items"]]
        pagination = Pagination(**raw["data"]["pagination"])

        return ProductsResponse(
            status     = raw["status"],
            code       = raw["code"],
            message    = raw["message"],
            items      = items,
            pagination = pagination,
        )

    # ── POST fetch ALL pages (auto-paginate) ──────────────
    def post_all_products(
        self,
        tenant:        Optional[str] = None,
        product_codes: Optional[list]= None,
        status:        Optional[str] = None,
        limit:         int           = 1000,
    ) -> list:
        all_items, page = [], 1
        while True:
            r = self.post_products(page=page, limit=limit, tenant=tenant,
                                   product_codes=product_codes, status=status)
            all_items.extend(r.items)
            total_pages = -(-r.pagination.total // limit)
            print(f"  Page {page}/{total_pages} — +{len(r.items)} items (tổng: {len(all_items)}/{r.pagination.total})")
            if len(all_items) >= r.pagination.total:
                break
            page += 1
        return all_items

    # ── Fetch ALL pages (auto-paginate) ───────────────────
    def get_all_products(
        self,
        tenant: Optional[str] = None,
        status: Optional[str] = None,
        limit:  int           = 1000,
    ) -> list:
        all_items, page = [], 1
        while True:
            r = self.get_products(page=page, limit=limit, tenant=tenant, status=status)
            all_items.extend(r.items)
            total_pages = -(-r.pagination.total // limit)
            print(f"  Page {page}/{total_pages} — +{len(r.items)} items (tổng: {len(all_items)}/{r.pagination.total})")
            if len(all_items) >= r.pagination.total:
                break
            page += 1
        return all_items


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────
PREVIEW_COLS = [
    "product_code", "product_ref", "tenant", "status",
    "product_type", "vendor_code", "source_type",
]

def print_products(products: list, max_rows: int = 10):
    """In bảng tóm tắt ra terminal."""
    col_w = 26
    header = " | ".join(f"{c:<{col_w}}" for c in PREVIEW_COLS)
    print(header)
    print("─" * len(header))
    for p in products[:max_rows]:
        row = " | ".join(f"{str(getattr(p, c, '') or ''):<{col_w}}" for c in PREVIEW_COLS)
        print(row)
    if len(products) > max_rows:
        print(f"  ... và {len(products) - max_rows} sản phẩm nữa")


def to_json(products: list, path: str):
    """Xuất toàn bộ products ra file JSON."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump([dataclasses.asdict(p) for p in products], f, ensure_ascii=False, indent=2)
    print(f"✓ Đã lưu {len(products)} sản phẩm → {path}")


def to_csv(products: list, path: str):
    """Xuất toàn bộ products ra file CSV."""
    import csv
    if not products:
        print("Không có dữ liệu để xuất.")
        return
    fields = list(dataclasses.asdict(products[0]).keys())
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows([dataclasses.asdict(p) for p in products])
    print(f"✓ Đã lưu {len(products)} sản phẩm → {path}")


# ─────────────────────────────────────────────────────────
# Main — examples
# ─────────────────────────────────────────────────────────
if __name__ == "__main__":

    # Đổi env thành "production" khi cần
    client = GohubClient(env="production")

    # ── 1. Lấy 1 trang, lọc tenant VN ──────────────────────
    print("─── GET /products  page=1  limit=10  tenant=VN ───")
    r = client.get_products(page=1, limit=10, tenant="VN")
    print(f"Status  : {r.status} ({r.code})")
    print(f"Message : {r.message}")
    print(f"Pages   : {r.pagination}")
    print()
    print_products(r.items)

    # ── 2. Lọc theo product_codes cụ thể ───────────────────
    # r2 = client.get_products(product_codes=["11VNMMBZ", "11VNMSFP"])
    # print_products(r2.items)

    # ── 3. Fetch toàn bộ sản phẩm, xuất CSV + JSON ─────────
    # print("\n─── Fetch ALL (auto-paginate) ───")
    # all_products = client.get_all_products(tenant="VN", status="Active")
    # to_json(all_products, "products_vn.json")
    # to_csv(all_products,  "products_vn.csv")

    # ── 4. POST /products ───────────────────────────────────
    print("\n─── POST /products  page=1  limit=10  tenant=VN ───")
    r_post = client.post_products(page=1, limit=10, tenant="VN")
    print(f"Status  : {r_post.status} ({r_post.code})")
    print(f"Message : {r_post.message}")
    print(f"Pages   : {r_post.pagination}")
    print()
    print_products(r_post.items)

    # ── 5. POST: lọc danh sách product_codes cụ thể ─────────
    # r5 = client.post_products(product_codes=["11VNMMBZ", "11VNMSFP"])
    # print_products(r5.items)

    # ── 6. POST: fetch toàn bộ, xuất CSV + JSON ─────────────
    # print("\n─── POST ALL (auto-paginate) ───")
    # all_products = client.post_all_products(tenant="VN", status="ACTIVE")
    # to_json(all_products, "products_vn.json")
    # to_csv(all_products,  "products_vn.csv")