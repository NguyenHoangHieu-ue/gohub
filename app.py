import streamlit as st
import dataclasses
import pandas as pd
import json
import io
import google.generativeai as genai
from gohub_api_clients import GohubClient, API_KEY

st.set_page_config(
    page_title="Gohub PM",
    page_icon="📡",
    layout="wide",
)

# ─────────────────────────────────────────────────────────
# Session state init
# ─────────────────────────────────────────────────────────
_defaults = {
    "data_products": [], "data_skus": [],
    "data_listings": [], "data_items": [],
    "chat_messages": [], "chat_context": "",
}
for _k, _v in _defaults.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v

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
    st.caption("**Dữ liệu đã tải**")
    for _tab, _key in [
        ("Products", "data_products"), ("SKUs",     "data_skus"),
        ("Listings", "data_listings"), ("Items",    "data_items"),
    ]:
        _n = len(st.session_state[_key])
        st.caption(f"{'🟢' if _n else '⚪'} {_tab}: **{f'{_n:,}' if _n else '—'}**")

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


# ─────────────────────────────────────────────────────────
# Page: Chatbot
# ─────────────────────────────────────────────────────────
if page == "🤖 Chatbot":
    st.title("🤖 Chatbot — Hỗ trợ Team Sale")

    products = st.session_state.data_products
    skus     = st.session_state.data_skus
    has_data = bool(products and skus)

    # Auto-build context from already-loaded data
    if has_data and not st.session_state.chat_context:
        st.session_state.chat_context = build_context(products, skus)

    col_btn, col_status = st.columns([1, 2])
    with col_btn:
        btn_label = "🔄 Tải lại dữ liệu" if has_data else "📥 Tải dữ liệu từ PM"
        if st.button(btn_label, use_container_width=True):
            with st.spinner("Đang tải Products & SKUs..."):
                try:
                    client = GohubClient(api_key=st.secrets.get("API_KEY", API_KEY))
                    st.session_state.data_products = client.get_all_products()
                    st.session_state.data_skus     = client.get_all_skus()
                    st.session_state.chat_context  = build_context(
                        st.session_state.data_products,
                        st.session_state.data_skus,
                    )
                    st.session_state.chat_messages = []
                    p = len(st.session_state.data_products)
                    s = len(st.session_state.data_skus)
                    st.success(f"✅ Đã tải {p:,} products · {s:,} SKUs")
                except Exception as e:
                    st.error(f"❌ Lỗi: {e}")

    with col_status:
        if has_data:
            st.info(f"✅ Sẵn sàng — {len(products):,} products · {len(skus):,} SKUs đã tải")
        else:
            st.warning("Chưa có dữ liệu. Nhấn **Tải dữ liệu từ PM** để bắt đầu.")

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
# Page: Explorer (Products / SKUs / Listings / Items)
# ─────────────────────────────────────────────────────────
else:
    label, state_key, detail_key, fname_prefix, display_cols = PAGE_CONFIG[page]
    existing = st.session_state[state_key]

    st.title(f"{page} Explorer")

    # ── Filters ──────────────────────────────────────────
    with st.expander("🔍 Bộ lọc", expanded=not bool(existing)):
        col1, col2 = st.columns(2)
        tenant = col1.selectbox("Tenant", ["", "VN", "US"],
                                format_func=lambda x: "Tất cả" if x == "" else x)
        status = col2.selectbox("Status", ["", "Active", "Inactive"],
                                format_func=lambda x: "Tất cả" if x == "" else x)

        if page == "🏷 SKUs":
            ca, cb = st.columns(2)
            sku_codes_input     = ca.text_input("SKU Codes", placeholder="Ví dụ: 11VNMMBZ00610, ...")
            product_codes_input = cb.text_input("Product Codes", placeholder="Ví dụ: 11VNMMBZ, ...")
        elif page == "📋 Listings":
            ca, cb, cc = st.columns(3)
            listing_type_code_input = ca.text_input("Listing Type Code", placeholder="Ví dụ: BUS")
            listing_codes_input     = cb.text_input("Listing Codes", placeholder="Ví dụ: L001, L002")
            product_codes_input     = cc.text_input("Product Codes", placeholder="Ví dụ: P001, P002")
        elif page == "🛒 Items":
            ca, cb = st.columns(2)
            item_type_code_input = ca.text_input("Item Type Code", placeholder="Ví dụ: BUS")
            item_codes_input     = cb.text_input("Item Codes", placeholder="Ví dụ: I001, I002")
            cc, cd = st.columns(2)
            listing_codes_input  = cc.text_input("Listing Codes", placeholder="Ví dụ: L001, L002")
            sku_codes_input      = cd.text_input("SKU Codes", placeholder="Ví dụ: S001, S002")
        else:  # Products
            product_codes_input = st.text_input("Product Codes", placeholder="Ví dụ: 11VNMMBZ, 11VNMSFP")

        with st.expander("⚙️ Nâng cao"):
            method = st.radio("Method", ["POST", "GET"], horizontal=True)

    # ── Fetch button (always visible) ────────────────────
    btn_label = f"🔄 Refresh {label}s" if existing else f"📥 Tải {label}s"
    run = st.button(btn_label, type="primary", use_container_width=True)

    if run:
        try:
            client = GohubClient(api_key=st.secrets.get("API_KEY", API_KEY))
            with st.spinner(f"Đang tải {label}s..."):
                if page == "🏷 SKUs":
                    kw = dict(tenant=tenant or None, status=status or None,
                              sku_codes=parse_codes(sku_codes_input),
                              product_codes=parse_codes(product_codes_input))
                    data = client.post_all_skus(**kw) if method == "POST" else client.get_all_skus(**kw)

                elif page == "📋 Listings":
                    if method == "POST":
                        data = client.post_all_listings(
                            tenant=tenant or None, status=status or None,
                            listing_codes=parse_codes(listing_codes_input),
                            product_codes=parse_codes(product_codes_input),
                        )
                    else:
                        data = client.get_all_listings(
                            tenant=tenant or None, status=status or None,
                            listing_type_code=listing_type_code_input or None,
                        )

                elif page == "🛒 Items":
                    if method == "POST":
                        data = client.post_all_items(
                            tenant=tenant or None,
                            item_codes=parse_codes(item_codes_input),
                            listing_codes=parse_codes(listing_codes_input),
                            sku_codes=parse_codes(sku_codes_input),
                        )
                    else:
                        data = client.get_all_items(
                            tenant=tenant or None, status=status or None,
                            item_type_code=item_type_code_input or None,
                        )

                else:  # Products
                    kw = dict(tenant=tenant or None, status=status or None,
                              product_codes=parse_codes(product_codes_input))
                    data = (client.post_all_products(**kw) if method == "POST"
                            else client.get_all_products(tenant=tenant or None, status=status or None))

            st.session_state[state_key] = data
            if page in ("🗂 Products", "🏷 SKUs"):
                st.session_state.chat_context = ""  # invalidate chatbot context
            st.success(f"✅ Đã tải **{len(data):,}** {label}s")

        except Exception as e:
            st.error(f"❌ Lỗi: {e}")
            st.exception(e)

    # ── Display ───────────────────────────────────────────
    result = st.session_state[state_key]

    if not result:
        st.info(f"Chưa có dữ liệu. Nhấn **Tải {label}s** để bắt đầu.")
    else:
        df_full = pd.DataFrame([dataclasses.asdict(i) for i in result])

        # Metrics
        m1, m2, m3 = st.columns(3)
        m1.metric(f"Tổng {label}s", f"{len(df_full):,}")
        if "status" in df_full.columns:
            n_active = (df_full["status"].str.lower() == "active").sum()
            m2.metric("Active", f"{n_active:,}")
            m3.metric("Inactive", f"{len(df_full) - n_active:,}")

        st.divider()

        # Search
        search = st.text_input(
            "search", placeholder=f"🔍 Tìm trong {len(df_full):,} {label}s...",
            label_visibility="collapsed",
        )
        cols_show = [c for c in display_cols if c in df_full.columns]
        df_show = local_search(df_full[cols_show], search, cols_show)

        if search:
            st.caption(f"Tìm thấy **{len(df_show):,}** / {len(df_full):,} {label}s")

        st.dataframe(df_show, use_container_width=True, height=520)

        # Downloads
        st.divider()
        dl1, dl2 = st.columns(2)
        fname = f"{fname_prefix}_{tenant or 'all'}"

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
