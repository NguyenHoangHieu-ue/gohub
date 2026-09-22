"""
Debug tạm: gọi GET /skus theo skuCode cụ thể, in RAW JSON y hệt response GoHub API trả
về (không qua dataclass Sku.from_dict()). XOÁ sau khi dùng xong.
"""
import json
import os
import requests

API_KEY   = os.environ["API_KEY"]
BASE_URL  = "https://api-pm.space.gohub.com/api-pull/gohub-cloud"
SKU_CODE  = os.environ.get("DEBUG_SKU_CODE", "").strip()

params = {"page": 1, "limit": 5}
if SKU_CODE:
    params["skuCode"] = SKU_CODE

resp = requests.get(
    f"{BASE_URL}/skus",
    params=params,
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    timeout=30,
)
print(f"HTTP {resp.status_code}")
print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
