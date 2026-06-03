import json
import streamlit as st
import streamlit_authenticator as stauth
import dataclasses
import pandas as pd
import io
import google.generativeai as genai
from supabase import create_client
from gohub_api_clients import Product, Sku, Listing, Item

st.set_page_config(page_title="Gohub PM", page_icon="📡", layout="wide")

# ─────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────
_auth_cfg = json.loads(st.secrets.get("AUTH_CONFIG", "{}"))
_credentials = {"usernames": _auth_cfg.get("usernames", {})}

authenticator = stauth.Authenticate(
    credentials=_credentials,
    cookie_name="gohub_pm",
    cookie_key=st.secrets.get("COOKIE_KEY", "gohub-secret-key"),
    cookie_expiry_days=7,
)

authenticator.login()

if not st.session_state.get("authentication_status"):
    if st.session_state.get("authentication_status") is False:
        st.error("❌ Sai tên đăng nhập hoặc mật khẩu")
    st.stop()

_username = st.session_state["username"]
role = _credentials["usernames"].get(_username, {}).get("role", "sale")

# ─────────────────────────────────────────────────────────
# Supabase — shared cache (tất cả user dùng chung)
# ─────────────────────────────────────────────────────────
def _sb():
    return create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_ANON_KEY"])

@st.cache_data(ttl=1800, show_spinner=False)
def load_table(table: str) -> list[dict]:
    sb, rows, batch, offset = _sb(), [], 1000, 0
    while True:
        resp = sb.table(table).select("*").range(offset, offset + batch - 1).execute()
        if not resp.data:
            break
        rows.extend(resp.data)
        if len(resp.data) < batch:
            break
        offset += batch
    return rows

@st.cache_data(ttl=1800, show_spinner=False)
def load_sync_log() -> dict:
    resp = _sb().table("sync_log").select("*").execute()
    return {r["table_name"]: r for r in (resp.data or [])}

# ─────────────────────────────────────────────────────────
# Column config
# ─────────────────────────────────────────────────────────
PRODUCT_COLS = [
    "product_code", "product_ref", "tenant", "status",
    "type_of_sim", "product_type", "vendor_code", "operator_code",
    "source_type", "sku_type", "data_type", "supported_countries",
    "network_type", "hotspot", "date_created", "last_modified_date",
]
SKU_COLS_ADMIN = [
    "sku_code", "sku_ref", "product_code", "tenant", "status",
    "sim_esim", "product_type", "data_amount", "data_amount_unit",
    "day_amount", "day_amount_unit", "throttle_speed", "call", "expirations",
    "currency", "original_cost", "latest_cogs", "latest_cogs_currency",
    "final_cogs_included_vat_vnd", "final_cogs_usd",
    "date_created", "last_modified_date",
]
SKU_COLS_SALE = [c for c in SKU_COLS_ADMIN
                 if c not in {"original_cost", "latest_cogs", "latest_cogs_currency",
                              "final_cogs_included_vat_vnd", "final_cogs_usd"}]
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

def sku_cols():
    return SKU_COLS_ADMIN if role == "admin" else SKU_COLS_SALE

PAGE_CONFIG = {
    "🗂 Products": ("Product", "products",  Product, "product_code", "products", PRODUCT_COLS),
    "🏷 SKUs":     ("SKU",     "skus",      Sku,     "sku_code",     "skus",     None),
    "📋 Listings": ("Listing", "listings",  Listing, "listing_code", "listings", LISTING_COLS),
    "🛒 Items":    ("Item",    "items",     Item,    "item_code",    "items",    ITEM_COLS),
}

# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────
def local_search(df: pd.DataFrame, query: str, cols: list) -> pd.DataFrame:
    if not query.strip():
        return df
    visible = [c for c in cols if c in df.columns]
    mask = df[visible].astype(str).apply(
        lambda col: col.str.contains(query, case=False, na=False)
    ).any(axis=1)
    return df[mask]

def fmt_sync(log: dict, table: str) -> str:
    if table not in log:
        return "—"
    from datetime import datetime, timezone
    ts = log[table]["last_sync"]
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()
    return dt.strftime("%d/%m %H:%M")

def build_context(products, skus) -> str:
    prod_lines = [
        f"- {p.product_code} | tenant: {p.tenant} | loại sim: {p.type_of_sim} "
        f"| countries: {p.supported_countries} | status: {p.status}"
        for p in products
    ]
    cost_part = " | final_cogs_vnd: {s.final_cogs_included_vat_vnd} VND" if role == "admin" else ""
    sku_lines = [
        f"- {s.sku_code} | product: {s.product_code} | tenant: {s.tenant} "
        f"| {s.sim_esim} | data: {s.data_amount}{s.data_amount_unit}/{s.day_amount}{s.day_amount_unit}"
        + (f" | final_cogs_vnd: {s.final_cogs_included_vat_vnd} VND" if role == "admin" else "")
        + f" | status: {s.status}"
        for s in skus
    ]
    return (
        "=== PRODUCTS ===\n" + "\n".join(prod_lines) +
        "\n\n=== SKUS ===\n" + "\n".join(sku_lines)
    )

SYSTEM_PROMPT = """Bạn là trợ lý AI của GoHub, hỗ trợ team sale tra cứu thông tin sản phẩm SIM/eSim du lịch.
Trả lời bằng tiếng Việt, ngắn gọn và chính xác dựa trên dữ liệu thực tế từ hệ thống PM bên dưới.
Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ là không có dữ liệu thay vì đoán.
Khi hiển thị giá, luôn ưu tiên dùng giá VND. Nếu chỉ có ngoại tệ thì ghi rõ đơn vị.

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
# Sidebar
# ─────────────────────────────────────────────────────────
with st.sidebar:
    st.title("📡 Gohub PM")
    st.caption(f"👤 {st.session_state['name']}  •  `{role}`")
    authenticator.logout(button_name="Đăng xuất", location="sidebar")

    st.divider()

    page = st.radio(
        "nav", label_visibility="collapsed",
        options=["🗂 Products", "🏷 SKUs", "📋 Listings", "🛒 Items", "🤖 Chatbot"],
    )

    st.divider()

    # Sync status
    try:
        sync_log = load_sync_log()
        st.caption("**Dữ liệu (sync mỗi 30 phút)**")
        for _t, _key in [("Products","products"),("SKUs","skus"),
                          ("Listings","listings"),("Items","items")]:
            _n = (sync_log.get(_key) or {}).get("record_count", 0)
            _ts = fmt_sync(sync_log, _key)
            _ico = "🟢" if _n else "⚪"
            st.caption(f"{_ico} **{_t}**: {f'{_n:,}' if _n else '—'} · {_ts}")
    except Exception:
        st.caption("⚠️ Không thể kết nối Supabase")

# ─────────────────────────────────────────────────────────
# Page: Chatbot
# ─────────────────────────────────────────────────────────
if page == "🤖 Chatbot":
    st.title("🤖 Chatbot — Hỗ trợ Team Sale")

    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = []
    if "chat_context" not in st.session_state:
        st.session_state.chat_context = ""

    if not st.session_state.chat_context:
        with st.spinner("Đang tải dữ liệu cho chatbot..."):
            try:
                products = [Product.from_dict(r) for r in load_table("products")]
                skus     = [Sku.from_dict(r)     for r in load_table("skus")]
                st.session_state.chat_context = build_context(products, skus)
                st.session_state._chat_info = f"{len(products):,} products · {len(skus):,} SKUs"
            except Exception as e:
                st.error(f"❌ Lỗi tải dữ liệu: {e}")

    if st.session_state.chat_context:
        st.caption(f"Dữ liệu: {st.session_state.get('_chat_info', '')} · tự refresh sau 30 phút")

    if st.button("🗑️ Xóa lịch sử chat", use_container_width=False):
        st.session_state.chat_messages = []
        st.rerun()

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
    label, table, model_cls, detail_key, fname_prefix, _cols = PAGE_CONFIG[page]
    display_cols = _cols if _cols is not None else sku_cols()

    st.title(f"{page} Explorer")

    # Load data (shared cache)
    with st.spinner(f"Đang tải {label}s..."):
        try:
            raw    = load_table(table)
            result = [model_cls.from_dict(r) for r in raw]
        except Exception as e:
            st.error(f"❌ Lỗi kết nối Supabase: {e}")
            st.stop()

    if not result:
        st.warning(f"Chưa có dữ liệu. GitHub Actions sẽ tự đồng bộ sau.")
        st.stop()

    df_full  = pd.DataFrame([dataclasses.asdict(i) for i in result])
    cols_show = [c for c in display_cols if c in df_full.columns]

    # ── Filter bar ────────────────────────────────────────
    c1, c2, c3 = st.columns([3, 1, 1])
    search        = c1.text_input("search", placeholder=f"🔍 Tìm trong {len(result):,} {label}s...", label_visibility="collapsed")
    tenant_filter = c2.selectbox("Tenant", ["Tất cả", "VN", "US"], label_visibility="collapsed")
    status_filter = c3.selectbox("Status", ["Tất cả", "Active", "Inactive"], label_visibility="collapsed")

    # ── Apply filters ─────────────────────────────────────
    df_view = df_full[cols_show].copy()
    if tenant_filter != "Tất cả" and "tenant" in df_view.columns:
        df_view = df_view[df_view["tenant"] == tenant_filter]
    if status_filter != "Tất cả" and "status" in df_view.columns:
        df_view = df_view[df_view["status"] == status_filter]
    df_view = local_search(df_view, search, cols_show)

    # ── Metrics ───────────────────────────────────────────
    m1, m2, m3 = st.columns(3)
    m1.metric(f"Tổng {label}s", f"{len(df_full):,}")
    if "status" in df_full.columns:
        n_active = (df_full["status"].str.lower() == "active").sum()
        m2.metric("Active", f"{n_active:,}")
        m3.metric("Inactive", f"{len(df_full) - n_active:,}")

    if len(df_view) < len(df_full):
        st.caption(f"Hiển thị **{len(df_view):,}** / {len(df_full):,} {label}s")

    st.dataframe(df_view, use_container_width=True, height=520)

    # ── Downloads ─────────────────────────────────────────
    st.divider()
    dl1, dl2 = st.columns(2)
    fname = f"{fname_prefix}_all"
    with dl1:
        buf = io.StringIO()
        df_full.to_csv(buf, index=False, encoding="utf-8-sig")
        st.download_button("⬇️ Download CSV", use_container_width=True,
                           data=buf.getvalue().encode("utf-8-sig"),
                           file_name=f"{fname}.csv", mime="text/csv")
    with dl2:
        import json as _json
        js = _json.dumps([dataclasses.asdict(i) for i in result], ensure_ascii=False, indent=2)
        st.download_button("⬇️ Download JSON", use_container_width=True,
                           data=js.encode("utf-8"),
                           file_name=f"{fname}.json", mime="application/json")

    # ── Detail viewer ─────────────────────────────────────
    with st.expander(f"🔎 Xem chi tiết 1 {label}"):
        keys     = [getattr(i, detail_key) for i in result]
        selected = st.selectbox(f"Chọn {detail_key}", keys)
        if selected:
            obj = next((i for i in result if getattr(i, detail_key) == selected), None)
            if obj:
                st.json(dataclasses.asdict(obj))
