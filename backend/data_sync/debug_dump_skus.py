"""
Debug tạm: gọi GET /skus (limit nhỏ) và in RAW JSON y hệt response GoHub API trả về,
không qua dataclass Sku.from_dict() (tránh mất field). Chỉ dùng để xem response thật
qua GitHub Actions (nơi có secret API_KEY) — XOÁ sau khi dùng xong, không phải công cụ
vận hành lâu dài.
"""
import json
import os
import requests

API_KEY  = os.environ["API_KEY"]
BASE_URL = "https://api-pm.space.gohub.com/api-pull/gohub-cloud"

resp = requests.get(
    f"{BASE_URL}/skus",
    params={"page": 1, "limit": 3},
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    timeout=30,
)
print(f"HTTP {resp.status_code}")
print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
