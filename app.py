import time
import streamlit as st
import dataclasses
import pandas as pd
import json
import io
import google.generativeai as genai
from datetime import datetime
from streamlit_autorefresh import st_autorefresh
from gohub_api_clients import GohubClient, API_KEY

st.set_page_config(
    page_title="Gohub PM",
    page_icon="📡",
    layout="wide",
)

# ─────────────────────────────────────────────────────────
# Auto-refresh trigger (every 30 minutes)
# ─────────────────────────────────────────────────────────
st_autorefresh(interval=30 * 60 * 1000, key="periodic_refresh")

STALE_SECONDS = 30 * 60  # 30 phút

# ─────────────────────────────────────────────────────────
# Session state init
# ─────────────────────────────────────────────────────────
_defaults = {
    "data_products": [],  "ts_products": 0,
    "data_skus":     [],  "ts_skus":     0,
    "data_listings": [],  "ts_listings": 0,
    "data_items":    [],  "ts_items":    0,
    "chat_messages": [],  "chat_context": "",
    "fetch_error":   "",
}
for _k, _v in _defaults.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v

# ─────────────────────────────────────────────────────────
# Fetch helpers
# ─────────────────────────────────────────────────────────
def is_stale(ts_key: str) -> bool:
    return time.time() - st.session_state[ts_key] > STALE_SECONDS

def fmt_ts(ts: float) -> str:
    if not ts:
        return "—"
    return datetime.fromtimestamp(ts).strftime("%H:%M")

def make_client() -> GohubClient:
    return GohubClient(api_key=st.secrets.get("API_KEY", API_KEY))

def fetch_products():
    client = make_client()
    st.session_state.data_products = client.get_all_products()
    st.session_state.ts_products   = time.time()
    st.session_state.chat_context  = ""  # invalidate chatbot context

def fetch_skus():
    client = make_client()
    st.session_state.data_skus = client.get_all_skus()
    st.session_state.ts_skus   = time.time()
    st.session_state.chat_context = ""

def fetch_listings():
    client = make_client()
    st.session_state.data_listings = client.get_all_listings()
    st.session_state.ts_listings   = time.time()

def fetch_items():
    client = make_client()
    st.session_state.data_items = client.get_all_items()
    st.session_state.ts_items   = time.time()

def refresh_all():
    """Force-refresh tất cả data đang có."""
    try:
        fetch_products()
        fetch_skus()
        if st.session_state.data_listings:
            fetch_listings()
        if st.session_state.data_items:
            fetch_items()
        st.session_state.fetch_error = ""
    except Exception as e:
        st.session_state.fetch_error = str(e)

# ─────────────────────────────────────────────────────────
# Auto-fetch Products + SKUs on startup / when stale
# ─────────────────────────────────────────────────────────
_need_core = is_stale("ts_products") or is_stale("ts_skus")
if _need_core:
    try:
        with st.spinner("🔄 Đang cập nhật Products & SKUs..."):
            fetch_products()
            fetch_skus()
        st.session_state.fetch_error = ""
    except Exception as _e:
        st.session_state.fetch_error = str(_e)

# ─────────────────────────────────────────────────────────
# Sidebar
# ─────────────────────────────────────────────────────────
with st.sidebar:
    st.title("📡 Gohub PM")
    page = st.radio(
        "nav", label_visibility="collapsed",
        options=["🗂 Products", "🏷 SKUs", "📋 Listings", "🛒 Items", "🤖 Chatbot"],
    )

    st.divider()

    # Data status
    st.caption("**Trạng thái dữ liệu**")
    for _name, _key, _ts in [
        ("Products", "data_products", "ts_products"),
        ("SKUs",     "data_skus",     "ts_skus"),
        ("Listings", "data_listings", "ts_listings"),
        ("Items",    "data_items",    "ts_items"),
    ]:
        _n  = len(st.session_state[_key])
        _t  = fmt_ts(st.session_state[_ts])
        _ico = "🟢" if _n else "⚪"
        _cnt = f"{_n:,} · {_t}" if _n else "—"
        st.caption(f"{_ico} **{_name}**: {_cnt}")

    if st.session_state.fetch_error:
        st.warning(f"⚠️ {st.session_state.fetch_error}")

    st.divider()
    if st.button("🔄 Refresh tất cả", use_container_width=True):
        with st.spinner("Đang refresh..."):
            refresh_all()
        st.rerun()

    st.caption(f"Tự động refresh mỗi 30 phút")

# ─────────────────────────────────────────────────────────
# Column config
# ─────────────────────────────────────────────────────────
PRODUCT_COLS = [
    "product_code", "product_ref", "tenant", "status",
    "type_of_sim", "product_type", "vendor_code", "operator_code",
    "source_type", "purchase_type", "sku_type", "data_type",
    "supported_countries", "network_type", "hotspot",
    "date_created", "last_modified_date",
]
SKU_COLS = [
    "sku_code", "sku_ref", "product_code", "tenant", "status",
    "sim_esim", "product_type", "parents",
    "data_amount", "data_amount_unit", "day_amount", "day_amount_unit",
    "throttle_speed", "call", "expirations",
    "currency", "original_cost", "latest_cogs", "latest_cogs_currency",
    "final_cogs_included_vat_vnd", "final_cogs_usd",
    "date_created", "last_modified_date",
]
LISTING_COLS = [
    "listing_code", "listing_ref", "reference_product_code", "tenant", "status",
    "listing_name_vn", "listing_type", "type_of_sim", "product_type",
    "network_operator", "category_code", "network_type",
    "expirations_en", "hotspot_en", "call_en", "top_up_options_en",
    "date_created", "last_modified_date",
]
ITEM_COLS = [
    "item_code", "item_ref", "sku_code", "listing_code", "tenant", "status",
    "item_name_vn", "item_type", "price_list", "category_code",
    "day_amount", "day_amount_unit", "data_amount", "data_amount_unit",
    "throttle_speed_en", "call_en", "unitprice", "currency",
    "date_created", "last_modified_date",
]

PAGE_CONFIG = {
    "🗂 Products": ("Product", "data_products", "product_code", "products", PRODUCT_COLS),
    "🏷 SKUs":     ("SKU",     "data_skus",     "sku_code",     "skus",     SKU_COLS),
    "📋 Listings": ("Listing", "data_listings", "listing_code", "listings", LISTING_COLS),
    "🛒 Items":    ("Item",    "data_items",    "item_code",    "items",    ITEM_COLS),
}

# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────
def parse_codes(raw: str) -> list | None:
    parts = [c.strip() for c in raw.split(",") if c.strip()]
    return parts or None

def local_search(df: pd.DataFrame, query: str, cols: list) -> pd.DataFrame:
    if not query.strip():
        return df
    visible = [c for c in cols if c in df.columns]
    mask = df[visible].astype(str).apply(
        lambda col: col.str.contains(query, case=False, na=False)
    ).any(axis=1)
    return df[mask]

def build_context(products, skus) -> str:
    prod_lines = [
        f"- {p.product_code} | tenant: {p.tenant} | loại sim: {p.type_of_sim} "
        f"| countries: {p.supported_countries} | status: {p.status}"
        for p in products
    ]
    sku_lines = [
        f"- {s.sku_code} | product: {s.product_code} | tenant: {s.tenant} "
        f"| {s.sim_esim} | data: {s.data_amount}{s.data_amount_unit}/{s.day_amount}{s.day_amount_unit} "
        f"| final_cogs_vnd: {s.final_cogs_included_vat_vnd} VND | status: {s.status}"
        for s in skus
    ]
    return (
        "=== PRODUCTS ===\n" + "\n".join(prod_lines) +
        "\n\n=== SKUS ===\n" + "\n".join(sku_lines)
    )

SYSTEM_PROMPT = """Bạn là trợ lý AI của GoHub, hỗ trợ team sale tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, ngắn gọn và chính xác dựa trên dữ liệu thực tế từ hệ thống PM bên dưới.
Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ là không có dữ liệu thay vì đoán.
Khi hiển thị giá, luôn ưu tiên dùng giá VND (trường final_cogs_included_vat_vnd). Nếu chỉ có ngoại tệ thì ghi rõ đơn vị.

Dữ liệu sản phẩm hiện tại:
"""

def get_gemini_response(messages: list, context: str) -> str:
    genai.configure(api_key=st.secrets.get("GEMINI_KEY", ""))
    model = genai.GenerativeModel(
        "gemini-3.5-flash",
        system_instruction=SYSTEM_PROMPT + context,
    )
    history = [
        {"role": "user" if m["role"] == "user" else "model", "parts": [m["content"]]}
        for m in messages[:-1]
    ]
    chat = model.start_chat(history=history)
    return chat.send_message(messages[-1]["content"]).text

def render_explorer(label, state_key, detail_key, fname_prefix, display_cols):
    """Shared renderer for all 4 explorer pages."""
    result = st.session_state[state_key]

    # Search + filter bar
    col_search, col_tenant, col_status = st.columns([3, 1, 1])
    search = col_search.text_input(
        "search", placeholder=f"🔍 Tìm trong {len(result):,} {label}s...",
        label_visibility="collapsed",
    )
    tenant_filter = col_tenant.selectbox(
        "Tenant", ["Tất cả", "VN", "US"], label_visibility="collapsed",
    )
    status_filter = col_status.selectbox(
        "Status", ["Tất cả", "Active", "Inactive"], label_visibility="collapsed",
    )

    # Build display dataframe
    df_full = pd.DataFrame([dataclasses.asdict(i) for i in result])
    cols_show = [c for c in display_cols if c in df_full.columns]
    df_view = df_full[cols_show].copy()

    if tenant_filter != "Tất cả" and "tenant" in df_view.columns:
        df_view = df_view[df_view["tenant"] == tenant_filter]
    if status_filter != "Tất cả" and "status" in df_view.columns:
        df_view = df_view[df_view["status"] == status_filter]
    df_view = local_search(df_view, search, cols_show)

    # Metrics
    m1, m2, m3 = st.columns(3)
    m1.metric(f"Tổng {label}s", f"{len(df_full):,}")
    if "status" in df_full.columns:
        n_active = (df_full["status"].str.lower() == "active").sum()
        m2.metric("Active", f"{n_active:,}")
        m3.metric("Inactive", f"{len(df_full) - n_active:,}")

    if search or tenant_filter != "Tất cả" or status_filter != "Tất cả":
        st.caption(f"Đang hiển thị **{len(df_view):,}** / {len(df_full):,} {label}s")

    st.dataframe(df_view, use_container_width=True, height=520)

    # Downloads
    st.divider()
    dl1, dl2 = st.columns(2)
    fname = f"{fname_prefix}_all"
    with dl1:
        csv_buf = io.StringIO()
        df_full.to_csv(csv_buf, index=False, encoding="utf-8-sig")
        st.download_button(
            "⬇️ Download CSV", use_container_width=True,
            data=csv_buf.getvalue().encode("utf-8-sig"),
            file_name=f"{fname}.csv", mime="text/csv",
        )
    with dl2:
        json_str = json.dumps(
            [dataclasses.asdict(i) for i in result], ensure_ascii=False, indent=2
        )
        st.download_button(
            "⬇️ Download JSON", use_container_width=True,
            data=json_str.encode("utf-8"),
            file_name=f"{fname}.json", mime="application/json",
        )

    # Detail viewer
    with st.expander(f"🔎 Xem chi tiết 1 {label}"):
        keys = [getattr(i, detail_key) for i in result]
        selected = st.selectbox(f"Chọn {detail_key}", keys)
        if selected:
            obj = next((i for i in result if getattr(i, detail_key) == selected), None)
            if obj:
                st.json(dataclasses.asdict(obj))


# ─────────────────────────────────────────────────────────
# Page: Chatbot
# ─────────────────────────────────────────────────────────
if page == "🤖 Chatbot":
    st.title("🤖 Chatbot — Hỗ trợ Team Sale")

    products = st.session_state.data_products
    skus     = st.session_state.data_skus

    if products and skus and not st.session_state.chat_context:
        st.session_state.chat_context = build_context(products, skus)

    if st.session_state.chat_context:
        st.caption(
            f"Dữ liệu: **{len(products):,}** products · **{len(skus):,}** SKUs · "
            f"cập nhật lúc {fmt_ts(st.session_state.ts_products)}"
        )
    else:
        st.warning("Dữ liệu chưa sẵn sàng — đang tải, vui lòng chờ giây lát...")

    st.divider()

    for msg in st.session_state.chat_messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    if prompt := st.chat_input(
        "Hỏi về sản phẩm SIM/eSim...",
        disabled=not st.session_state.chat_context,
    ):
        st.session_state.chat_messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)
        with st.chat_message("assistant"):
            with st.spinner("Đang xử lý..."):
                try:
                    reply = get_gemini_response(
                        st.session_state.chat_messages,
                        st.session_state.chat_context,
                    )
                    st.markdown(reply)
                    st.session_state.chat_messages.append({"role": "assistant", "content": reply})
                except Exception as e:
                    st.error(f"❌ Lỗi Gemini: {e}")

# ─────────────────────────────────────────────────────────
# Page: Explorer
# ─────────────────────────────────────────────────────────
else:
    label, state_key, detail_key, fname_prefix, display_cols = PAGE_CONFIG[page]
    ts_key_map = {
        "🗂 Products": ("ts_products", fetch_products),
        "🏷 SKUs":     ("ts_skus",     fetch_skus),
        "📋 Listings": ("ts_listings", fetch_listings),
        "🛒 Items":    ("ts_items",    fetch_items),
    }
    ts_key, fetch_fn = ts_key_map[page]

    # Auto-fetch when first visiting this tab or data is stale
    if is_stale(ts_key):
        try:
            with st.spinner(f"🔄 Đang tải {label}s..."):
                fetch_fn()
        except Exception as e:
            st.error(f"❌ Lỗi tải {label}s: {e}")

    st.title(f"{page} Explorer")

    _ts = fmt_ts(st.session_state[ts_key])
    _n  = len(st.session_state[state_key])
    st.caption(f"**{_n:,}** {label}s · cập nhật lúc **{_ts}** · tự refresh sau 30 phút")

    result = st.session_state[state_key]
    if result:
        render_explorer(label, state_key, detail_key, fname_prefix, display_cols)
    else:
        st.info(f"Đang tải {label}s, vui lòng chờ...")
