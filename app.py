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
        ["🗂 Products", "🏷 SKUs", "🤖 Chatbot"],
        index=0,
    )
    st.divider()
    env = st.selectbox("Environment", ["production"], index=0)

is_sku      = data_type == "🏷 SKUs"
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
        f"| status: {s.status}"
        for s in skus
    ]
    return (
        "=== PRODUCTS ===\n" + "\n".join(prod_lines) +
        "\n\n=== SKUS ===\n" + "\n".join(sku_lines)
    )


SYSTEM_PROMPT = """Bạn là trợ lý AI của GoHub, hỗ trợ team sale tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, ngắn gọn và chính xác dựa trên dữ liệu thực tế từ hệ thống PM bên dưới.
Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ là không có dữ liệu thay vì đoán.

Dữ liệu sản phẩm hiện tại:
"""


def get_gemini_response(messages: list, context: str) -> str:
    genai.configure(api_key=st.secrets.get("GEMINI_KEY", ""))
    model = genai.GenerativeModel(
        "gemini-1.5-flash",
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
# Page: Products / SKUs
# ─────────────────────────────────────────────────────────
else:
    st.title("🏷 SKU Explorer" if is_sku else "🗂 Product Explorer")
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
            with col_a:
                sku_codes_input = st.text_input(
                    "SKU Codes (cách nhau bằng dấu phẩy)",
                    placeholder="Ví dụ: 11VNMMBZ00610, 11VNMSFP00315",
                )
            with col_b:
                product_codes_input = st.text_input(
                    "Product Codes (lọc SKU theo product)",
                    placeholder="Ví dụ: 11VNMMBZ, 11VNMSFP",
                )
        else:
            product_codes_input = st.text_input(
                "Product Codes (cách nhau bằng dấu phẩy)",
                placeholder="Ví dụ: 11VNMMBZ, 11VNMSFP",
            )

    run = st.button("🚀 Fetch data", type="primary", use_container_width=True)

    if run:
        try:
            client = GohubClient(api_key=st.secrets.get("API_KEY", API_KEY))
            product_codes = parse_codes(product_codes_input)

            with st.spinner("Đang tải toàn bộ dữ liệu..."):

                if is_sku:
                    sku_codes = parse_codes(sku_codes_input)
                    if method == "POST":
                        items = client.post_all_skus(
                            tenant=tenant or None,
                            status=status or None,
                            sku_codes=sku_codes,
                            product_codes=product_codes,
                        )
                    else:
                        items = client.get_all_skus(
                            tenant=tenant or None,
                            status=status or None,
                            sku_codes=sku_codes,
                            product_codes=product_codes,
                        )
                    display_cols = SKU_COLS
                    detail_key   = "sku_code"
                    label        = "SKU"
                else:
                    if method == "POST":
                        items = client.post_all_products(
                            tenant=tenant or None,
                            status=status or None,
                            product_codes=product_codes,
                        )
                    else:
                        items = client.get_all_products(
                            tenant=tenant or None,
                            status=status or None,
                        )
                    display_cols = PRODUCT_COLS
                    detail_key   = "product_code"
                    label        = "Product"

            st.success(f"✅ Đã tải **{len(items):,}** {label}s")

            df = pd.DataFrame([dataclasses.asdict(i) for i in items])

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
            fname = f"{'skus' if is_sku else 'products'}_{tenant or 'all'}_{env}"

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
                    [dataclasses.asdict(i) for i in items],
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
                keys = [getattr(i, detail_key) for i in items]
                selected = st.selectbox(f"Chọn {detail_key}", keys)
                if selected:
                    obj = next((i for i in items if getattr(i, detail_key) == selected), None)
                    if obj:
                        st.json(dataclasses.asdict(obj))

        except Exception as e:
            st.error(f"❌ Lỗi: {e}")
            st.exception(e)
