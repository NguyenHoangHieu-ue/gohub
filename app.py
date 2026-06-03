import streamlit as st
import dataclasses
import pandas as pd
import json
import io
import google.generativeai as genai
from gohub_api_clients import GohubClient, API_KEY

st.set_page_config(
    page_title="Gohub PM Explorer",
    page_icon="📡",
    layout="wide",
)

# ─────────────────────────────────────────────────────────
# Sidebar — navigation only
# ─────────────────────────────────────────────────────────
with st.sidebar:
    st.title("📡 Gohub PM")
    data_type = st.radio(
        "Chọn loại dữ liệu",
        ["🗂 Products", "🏷 SKUs", "📋 Listings", "🛒 Items", "🤖 Chatbot"],
        index=0,
    )
    st.divider()
    env = st.selectbox("Environment", ["production"], index=0)

is_sku      = data_type == "🏷 SKUs"
is_listing  = data_type == "📋 Listings"
is_item     = data_type == "🛒 Items"
is_chatbot  = data_type == "🤖 Chatbot"


# ─────────────────────────────────────────────────────────
# Helpers — data
# ─────────────────────────────────────────────────────────
def parse_codes(raw: str) -> list | None:
    items = [c.strip() for c in raw.split(",") if c.strip()]
    return items if items else None


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
    "throttle_speed_en", "call_en",
    "unitprice", "currency",
    "date_created", "last_modified_date",
]

PAGE_LABEL = {
    "🗂 Products": ("Product", "product_code", "products"),
    "🏷 SKUs":     ("SKU",     "sku_code",     "skus"),
    "📋 Listings": ("Listing", "listing_code", "listings"),
    "🛒 Items":    ("Item",    "item_code",    "items"),
}


# ─────────────────────────────────────────────────────────
# Helpers — chatbot
# ─────────────────────────────────────────────────────────
def build_context(products, skus) -> str:
    prod_lines = [
        f"- {p.product_code} | tenant: {p.tenant} | loại sim: {p.type_of_sim} "
        f"| countries: {p.supported_countries} | status: {p.status}"
        for p in products
    ]
    sku_lines = [
        f"- {s.sku_code} | product: {s.product_code} | tenant: {s.tenant} "
        f"| {s.sim_esim} | data: {s.data_amount}{s.data_amount_unit} / {s.day_amount}{s.day_amount_unit} "
        f"| giá: {s.original_cost} {s.currency} | cogs: {s.latest_cogs} {s.latest_cogs_currency} "
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
Khi hiển thị giá, luôn ưu tiên dùng giá VND (trường final_cogs_included_vat_vnd hoặc reference_cost_vnd). Nếu chỉ có giá ngoại tệ thì ghi rõ đơn vị tiền tệ đó.

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
if is_chatbot:
    st.title("🤖 Chatbot — Hỗ trợ Team Sale")

    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = []
    if "chat_context" not in st.session_state:
        st.session_state.chat_context = ""

    col_btn, col_status = st.columns([1, 2])
    with col_btn:
        if st.button("🔄 Tải dữ liệu từ PM", use_container_width=True):
            with st.spinner("Đang tải Products & SKUs..."):
                try:
                    client = GohubClient(api_key=st.secrets.get("API_KEY", API_KEY))
                    products = client.get_all_products()
                    skus     = client.get_all_skus()
                    st.session_state.chat_context  = build_context(products, skus)
                    st.session_state.chat_messages = []
                    st.success(f"✅ Đã tải {len(products):,} products · {len(skus):,} SKUs")
                except Exception as e:
                    st.error(f"❌ Lỗi tải dữ liệu: {e}")
    with col_status:
        if st.session_state.chat_context:
            st.info("Dữ liệu đã sẵn sàng — bắt đầu hỏi bên dưới.")
        else:
            st.warning("Chưa có dữ liệu — nhấn **Tải dữ liệu từ PM** trước.")

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
# Page: Products / SKUs / Listings / Items
# ─────────────────────────────────────────────────────────
else:
    label, detail_key, fname_prefix = PAGE_LABEL[data_type]
    titles = {
        "🗂 Products": "🗂 Product Explorer",
        "🏷 SKUs":     "🏷 SKU Explorer",
        "📋 Listings": "📋 Listing Explorer",
        "🛒 Items":    "🛒 Item Explorer",
    }
    st.title(titles[data_type])
    st.caption(f"Env: **{env}** · Fetch: **tất cả trang (auto-paginate)**")

    with st.expander("🔍 Bộ lọc", expanded=True):
        col1, col2, col3 = st.columns(3)
        with col1:
            tenant = st.selectbox("Tenant", ["", "VN", "US"],
                                  format_func=lambda x: "Tất cả" if x == "" else x)
        with col2:
            status = st.selectbox("Status", ["", "Active", "Inactive"],
                                  format_func=lambda x: "Tất cả" if x == "" else x)
        with col3:
            method = st.selectbox("Method", ["POST", "GET"])

        if is_sku:
            col_a, col_b = st.columns(2)
            sku_codes_input     = col_a.text_input("SKU Codes", placeholder="Ví dụ: 11VNMMBZ00610, 11VNMSFP00315")
            product_codes_input = col_b.text_input("Product Codes", placeholder="Ví dụ: 11VNMMBZ, 11VNMSFP")
        elif is_listing:
            col_a, col_b, col_c = st.columns(3)
            listing_type_code_input = col_a.text_input("Listing Type Code (GET)", placeholder="Ví dụ: BUS")
            listing_codes_input     = col_b.text_input("Listing Codes (POST)", placeholder="Ví dụ: L001, L002")
            product_codes_input     = col_c.text_input("Product Codes (POST)", placeholder="Ví dụ: P001, P002")
        elif is_item:
            col_a, col_b = st.columns(2)
            item_type_code_input = col_a.text_input("Item Type Code (GET)", placeholder="Ví dụ: BUS")
            item_codes_input     = col_b.text_input("Item Codes (POST)", placeholder="Ví dụ: I001, I002")
            col_c, col_d = st.columns(2)
            listing_codes_input  = col_c.text_input("Listing Codes (POST)", placeholder="Ví dụ: L001, L002")
            sku_codes_input      = col_d.text_input("SKU Codes (POST)", placeholder="Ví dụ: S001, S002")
        else:  # Products
            product_codes_input = st.text_input("Product Codes", placeholder="Ví dụ: 11VNMMBZ, 11VNMSFP")

    run = st.button("🚀 Fetch data", type="primary", use_container_width=True)

    if run:
        try:
            client = GohubClient(api_key=st.secrets.get("API_KEY", API_KEY))

            with st.spinner("Đang tải toàn bộ dữ liệu..."):
                if is_sku:
                    fetch_kwargs = dict(tenant=tenant or None, status=status or None,
                                        sku_codes=parse_codes(sku_codes_input),
                                        product_codes=parse_codes(product_codes_input))
                    result = client.post_all_skus(**fetch_kwargs) if method == "POST" else client.get_all_skus(**fetch_kwargs)
                    display_cols = SKU_COLS

                elif is_listing:
                    if method == "POST":
                        result = client.post_all_listings(
                            tenant=tenant or None, status=status or None,
                            listing_codes=parse_codes(listing_codes_input),
                            product_codes=parse_codes(product_codes_input),
                        )
                    else:
                        result = client.get_all_listings(
                            tenant=tenant or None, status=status or None,
                            listing_type_code=listing_type_code_input or None,
                        )
                    display_cols = LISTING_COLS

                elif is_item:
                    if method == "POST":
                        result = client.post_all_items(
                            tenant=tenant or None,
                            item_codes=parse_codes(item_codes_input),
                            listing_codes=parse_codes(listing_codes_input),
                            sku_codes=parse_codes(sku_codes_input),
                        )
                    else:
                        result = client.get_all_items(
                            tenant=tenant or None, status=status or None,
                            item_type_code=item_type_code_input or None,
                        )
                    display_cols = ITEM_COLS

                else:  # Products
                    fetch_kwargs = dict(tenant=tenant or None, status=status or None,
                                        product_codes=parse_codes(product_codes_input))
                    result = client.post_all_products(**fetch_kwargs) if method == "POST" else client.get_all_products(tenant=tenant or None, status=status or None)
                    display_cols = PRODUCT_COLS

            st.success(f"✅ Đã tải **{len(result):,}** {label}s")

            df = pd.DataFrame([dataclasses.asdict(i) for i in result])

            m1, m2, m3, m4 = st.columns(4)
            m1.metric(f"Tổng {label}s", f"{len(df):,}")
            m2.metric("Tenant", tenant or "All")
            m3.metric("Status", status or "All")
            m4.metric("Method", method)

            st.divider()

            cols_show = [c for c in display_cols if c in df.columns]
            st.dataframe(df[cols_show], use_container_width=True, height=520)

            st.divider()
            dl1, dl2 = st.columns(2)
            fname = f"{fname_prefix}_{tenant or 'all'}_{env}"

            with dl1:
                csv_buf = io.StringIO()
                df.to_csv(csv_buf, index=False, encoding="utf-8-sig")
                st.download_button(
                    "⬇️ Download CSV",
                    data=csv_buf.getvalue().encode("utf-8-sig"),
                    file_name=f"{fname}.csv",
                    mime="text/csv",
                    use_container_width=True,
                )
            with dl2:
                json_str = json.dumps(
                    [dataclasses.asdict(i) for i in result],
                    ensure_ascii=False, indent=2,
                )
                st.download_button(
                    "⬇️ Download JSON",
                    data=json_str.encode("utf-8"),
                    file_name=f"{fname}.json",
                    mime="application/json",
                    use_container_width=True,
                )

            with st.expander(f"🔎 Xem chi tiết 1 {label}"):
                keys = [getattr(i, detail_key) for i in result]
                selected = st.selectbox(f"Chọn {detail_key}", keys)
                if selected:
                    obj = next((i for i in result if getattr(i, detail_key) == selected), None)
                    if obj:
                        st.json(dataclasses.asdict(obj))

        except Exception as e:
            st.error(f"❌ Lỗi: {e}")
            st.exception(e)
