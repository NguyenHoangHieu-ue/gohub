"""Kiểm thử phân trang của GohubClient._fetch_all (chạy: cd backend/data_sync && python -m pytest -q).

Không gọi mạng: fetch_page_fn giả lập server GoHub API cắt cứng 200 dòng/trang dù client xin limit=1000
(hành vi thật quan sát ở run GitHub Actions 2026-09-18).
"""
import threading
from types import SimpleNamespace

import pytest
import requests

from gohub_api_clients import GohubClient

SERVER_CAP = 200


def make_server(total: int, fail_once_on=None, drop_last=False, status_on_fail=None):
    """Trả (fetch_page_fn, calls). Server: offset = (page-1)*min(limit, cap)."""
    calls = []
    failed = set()
    lock = threading.Lock()

    def fetch(page, limit):
        with lock:
            calls.append((page, limit))
        if fail_once_on == page and page not in failed:
            failed.add(page)
            if status_on_fail:
                resp = SimpleNamespace(status_code=status_on_fail)
                raise requests.exceptions.HTTPError(f"{status_on_fail}", response=resp)
            raise requests.exceptions.RetryError("too many 502 error responses")
        size = min(limit, SERVER_CAP)
        start = (page - 1) * size
        rows = list(range(start, min(start + size, total)))
        if drop_last and rows and start + size >= total:
            rows = rows[:-1]
        return SimpleNamespace(items=rows, pagination=SimpleNamespace(total=total, page=page, limit=limit))

    return fetch, calls


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(GohubClient, "RETRY_DELAY_BASE", 0)   # không chờ thật trong test
    return GohubClient(api_key="test")


def test_uses_real_page_size_and_keeps_order(client):
    fetch, calls = make_server(1084)
    rows = client._fetch_all(fetch, limit=1000, label="t", workers=3)
    assert rows == list(range(1084))
    pages = sorted(p for p, _ in calls)
    assert pages == [1, 2, 3, 4, 5, 6]          # 1084/200 = 6 trang, không phải 2 như khi giả định 1000
    assert all(limit == SERVER_CAP for p, limit in calls if p > 1)


def test_single_page(client):
    fetch, calls = make_server(150)
    assert client._fetch_all(fetch, limit=1000, label="t", workers=4) == list(range(150))
    assert len(calls) == 1


def test_empty(client):
    fetch, _ = make_server(0)
    assert client._fetch_all(fetch, limit=1000, label="t", workers=2) == []


def test_transient_error_is_retried(client):
    fetch, calls = make_server(1000, fail_once_on=3)
    rows = client._fetch_all(fetch, limit=1000, label="t", workers=3)
    assert rows == list(range(1000))
    assert sum(1 for p, _ in calls if p == 3) == 2   # lần 1 lỗi, lần 2 OK


def test_permanent_failure_raises_after_attempts(client):
    def always_502(page, limit):
        if page == 1:
            return SimpleNamespace(items=list(range(200)), pagination=SimpleNamespace(total=1000, page=1, limit=limit))
        raise requests.exceptions.RetryError("502")

    with pytest.raises(requests.exceptions.RetryError):
        client._fetch_all(always_502, limit=1000, label="t", workers=2)


def test_client_error_403_is_not_retried(client):
    fetch, calls = make_server(1000, fail_once_on=2, status_on_fail=403)
    with pytest.raises(requests.exceptions.HTTPError):
        client._fetch_all(fetch, limit=1000, label="t", workers=1)
    assert sum(1 for p, _ in calls if p == 2) == 1


def test_429_is_retried(client):
    fetch, calls = make_server(600, fail_once_on=2, status_on_fail=429)
    assert client._fetch_all(fetch, limit=1000, label="t", workers=2) == list(range(600))
    assert sum(1 for p, _ in calls if p == 2) == 2


def test_missing_rows_raise(client):
    fetch, _ = make_server(1000, drop_last=True)
    with pytest.raises(RuntimeError, match="tải thiếu/thừa"):
        client._fetch_all(fetch, limit=1000, label="t", workers=3)


def test_models_tolerate_missing_and_extra_fields():
    """API bỏ trường `expirations` của SKU (run 2026-09-19) — không được ném TypeError."""
    from gohub_api_clients import Sku, Product, Listing, Item
    sku = Sku.from_dict({"sku_code": "X", "product_code": "P", "tenant": "VN", "status": "Active", "unexpected": 1})
    assert sku.sku_code == "X" and sku.expirations is None and not hasattr(sku, "unexpected")
    assert Product.from_dict({"product_code": "P"}).vendor_code is None
    assert Listing.from_dict({}).listing_code is None
    assert Item.from_dict({"item_code": "I"}).item_code == "I"
