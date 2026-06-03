import streamlit as st
import dataclasses
import pandas as pd
import json
import io
from gohub_api_client import GohubClient, API_KEY

st.set_page_config(
    page_title="Gohub Product Manager",
    page_icon="📡",
    layout="wide",
)

# ─────────────────────────────────────────────────────────
# Sidebar — config
# ─────────────────────────────────────────────────────────
with st.sidebar:
    st.title("⚙️ Config")

    env = st.selectbox("Environment", ["production", "staging"], index=0)

    api_key = st.text_input(
        "API Key",
        value=API_KEY,
        type="password",
        help="Bearer token để xác thực API",
    )

    st.divider()
    st.caption("Gohub API Client v1.0")

# ─────────────────────────────────────────────────────────
# Header
# ─────────────────────────────────────────────────────────
st.title("📡 Gohub Product Manager")
st.caption(f"Env: **{env}** · Partner: **gohub-cloud**")

# ─────────────────────────────────────────────────────────
# Filters
# ─────────────────────────────────────────────────────────
with st.expander("🔍 Bộ lọc", expanded=True):
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        tenant = st.selectbox("Tenant", ["", "VN", "US"], index=0,
                              format_func=lambda x: "Tất cả" if x == "" else x)
    with col2:
        status = st.selectbox("Status", ["", "Active", "Inactive"], index=0,
                              format_func=lambda x: "Tất cả" if x == "" else x)
    with col3:
        method = st.selectbox("Method", ["POST", "GET"], index=0)
    with col4:
        limit = st.selectbox("Limit / page", [100, 500, 1000], index=0)

    product_codes_input = st.text_input(
        "Product Codes (cách nhau bằng dấu phẩy)",
        placeholder="Ví dụ: 11VNMMBZ, 11VNMSFP",
    )

    fetch_all = st.checkbox("Fetch ALL pages (auto-paginate)", value=False)

run = st.button("🚀 Fetch data", type="primary", use_container_width=True)

# ─────────────────────────────────────────────────────────
# Fetch
# ─────────────────────────────────────────────────────────
if run:
    product_codes = (
        [c.strip() for c in product_codes_input.split(",") if c.strip()]
        if product_codes_input else None
    )

    try:
        client = GohubClient(env=env)
        # override API key nếu user đổi trong sidebar
        client.session.headers.update({"Authorization": f"Bearer {api_key}"})

        with st.spinner("Đang tải dữ liệu..."):
            if fetch_all:
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
                total = len(items)
                st.success(f"✅ Đã tải **{total}** sản phẩm (tất cả trang)")
            else:
                if method == "POST":
                    r = client.post_products(
                        page=1, limit=limit,
                        tenant=tenant or None,
                        status=status or None,
                        product_codes=product_codes,
                    )
                else:
                    r = client.get_products(
                        page=1, limit=limit,
                        tenant=tenant or None,
                        status=status or None,
                        product_codes=product_codes,
                    )
                items = r.items
                total = r.pagination.total
                st.success(
                    f"✅ Hiển thị **{len(items)}** / **{total}** sản phẩm "
                    f"(trang 1 · limit {limit})"
                )

        # ── Convert to DataFrame ───────────────────────────
        df = pd.DataFrame([dataclasses.asdict(p) for p in items])

        # ── Metrics ───────────────────────────────────────
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Tổng sản phẩm", total)
        m2.metric("Hiển thị", len(df))
        m3.metric("Tenant", tenant or "All")
        m4.metric("Status", status or "All")

        st.divider()

        # ── Table ─────────────────────────────────────────
        DISPLAY_COLS = [
            "product_code", "product_ref", "tenant", "status",
            "type_of_sim", "product_type", "vendor_code",
            "operator_code", "source_type", "purchase_type",
            "supported_countries", "network_type", "hotspot",
            "date_created", "last_modified_date",
        ]
        cols_exist = [c for c in DISPLAY_COLS if c in df.columns]
        st.dataframe(df[cols_exist], use_container_width=True, height=500)

        # ── Download buttons ──────────────────────────────
        st.divider()
        dl1, dl2 = st.columns(2)

        with dl1:
            csv_buf = io.StringIO()
            df.to_csv(csv_buf, index=False, encoding="utf-8-sig")
            st.download_button(
                label="⬇️ Download CSV",
                data=csv_buf.getvalue().encode("utf-8-sig"),
                file_name=f"products_{tenant or 'all'}_{env}.csv",
                mime="text/csv",
                use_container_width=True,
            )

        with dl2:
            json_str = json.dumps(
                [dataclasses.asdict(p) for p in items],
                ensure_ascii=False, indent=2
            )
            st.download_button(
                label="⬇️ Download JSON",
                data=json_str.encode("utf-8"),
                file_name=f"products_{tenant or 'all'}_{env}.json",
                mime="application/json",
                use_container_width=True,
            )

        # ── Detail expander ───────────────────────────────
        with st.expander("🔎 Xem chi tiết 1 sản phẩm"):
            codes = [p.product_code for p in items]
            selected = st.selectbox("Chọn product_code", codes)
            if selected:
                product = next((p for p in items if p.product_code == selected), None)
                if product:
                    st.json(dataclasses.asdict(product))

    except Exception as e:
        st.error(f"❌ Lỗi: {e}")
        st.exception(e)