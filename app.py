import streamlit as st
import streamlit_authenticator as stauth
import dataclasses
import pandas as pd
import io
import bcrypt
from datetime import datetime, timezone
import google.generativeai as genai
from supabase import create_client
from gohub_api_clients import Product, Sku, Listing, Item

st.set_page_config(page_title="Gohub PM", page_icon="📡", layout="wide")

st.markdown("""
<style>
.block-container { padding-top: 1.25rem; padding-bottom: 2rem; }

[data-testid="metric-container"] {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 1rem 1.25rem;
}
[data-testid="stMetricLabel"]  { font-size: .8rem !important; color: #64748b !important; }
[data-testid="stMetricValue"]  { font-size: 1.6rem !important; font-weight: 700 !important; }

.stTabs [data-baseweb="tab-list"] { gap: 4px; }
.stTabs [data-baseweb="tab"] {
    border-radius: 8px 8px 0 0;
    padding: 8px 18px;
    font-weight: 500;
    font-size: .9rem;
}

[data-testid="stChatMessage"] { border-radius: 12px; margin-bottom: 4px; }

div[data-testid="stSidebar"] hr { margin: .75rem 0; }
</style>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────
# Supabase clients
# ─────────────────────────────────────────────────────────
@st.cache_resource
def _sb():
    return create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_ANON_KEY"])

@st.cache_resource
def _sb_admin():
    return create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_SERVICE_KEY"])

# ─────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────
@st.cache_data(ttl=60, show_spinner=False)
def _load_users() -> list[dict]:
    resp = _sb_admin().table("users").select("*").order("username").execute()
    return resp.data or []

def _build_credentials() -> dict:
    return {
        "usernames": {
            u["username"]: {
                "name":     u["name"],
                "email":    u.get("email") or "",
                "password": u["password"],
            }
            for u in _load_users()
        }
    }

_credentials = _build_credentials()

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
_name     = st.session_state["name"]
role      = next((u["role"] for u in _load_users() if u["username"] == _username), "sale")

# ─────────────────────────────────────────────────────────
# Shared data cache
# ─────────────────────────────────────────────────────────
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
    0: ("Product", "products",  Product, "product_code", "products", PRODUCT_COLS),
    1: ("SKU",     "skus",      Sku,     "sku_code",     "skus",     None),
    2: ("Listing", "listings",  Listing, "listing_code", "listings", LISTING_COLS),
    3: ("Item",    "items",     Item,    "item_code",    "items",    ITEM_COLS),
}

# Column config cho dataframe
_VND = st.column_config.NumberColumn(format="%,.0f ₫")
_USD = st.column_config.NumberColumn(format="$%.2f")
_NUM = st.column_config.NumberColumn(format="%,d")
_DEC = st.column_config.NumberColumn(format="%.1f")

COL_CFG: dict = {
    "original_cost":               _VND,
    "latest_cogs":                 _VND,
    "final_cogs_included_vat_vnd": _VND,
    "reference_cost_vnd":          _VND,
    "unitprice":                   _VND,
    "final_cogs_usd":              _USD,
    "day_amount":                  _NUM,
    "data_amount":                 _DEC,
    "expirations":                 _NUM,
    "expirations_en":              _NUM,
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
    ts = log[table]["last_sync"]
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()
    return dt.strftime("%d/%m %H:%M")

def build_context(products, skus) -> str:
    prod_lines = [
        f"- {p.product_code} | tenant: {p.tenant} | loại sim: {p.type_of_sim} "
        f"| countries: {p.supported_countries} | status: {p.status}"
        for p in products
    ]
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
# Sidebar — user info + sync status only
# ─────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## 📡 Gohub PM")

    with st.container(border=True):
        role_badge = "🔴 Admin" if role == "admin" else "🟢 Sale"
        st.markdown(f"**{_name}**")
        st.caption(f"`{_username}` · {role_badge}")

    authenticator.logout(button_name="Đăng xuất", location="sidebar")

    st.divider()

    try:
        sync_log = load_sync_log()
        st.caption("**Đồng bộ dữ liệu**")
        for _label, _key in [
            ("Products", "products"), ("SKUs",  "skus"),
            ("Listings", "listings"), ("Items", "items"),
        ]:
            _n  = (sync_log.get(_key) or {}).get("record_count", 0)
            _ts = fmt_sync(sync_log, _key)
            _ico = "🟢" if _n else "⚪"
            st.caption(f"{_ico} **{_label}**: {f'{_n:,}' if _n else '—'} · {_ts}")
    except Exception:
        st.caption("⚠️ Không thể kết nối Supabase")

# ─────────────────────────────────────────────────────────
# Navigation — tabs
# ─────────────────────────────────────────────────────────
tab_labels = ["🗂 Products", "🏷 SKUs", "📋 Listings", "🛒 Items", "🤖 Chatbot"]
if role == "admin":
    tab_labels.append("👤 Admin")

tabs = st.tabs(tab_labels)

# ─────────────────────────────────────────────────────────
# Helper: render explorer tab
# ─────────────────────────────────────────────────────────
def render_explorer(tab_idx: int):
    label, table, model_cls, detail_key, fname_prefix, _cols = PAGE_CONFIG[tab_idx]
    display_cols = _cols if _cols is not None else sku_cols()

    with st.spinner(f"Đang tải {label}s..."):
        try:
            raw    = load_table(table)
            result = [model_cls.from_dict(r) for r in raw]
        except Exception as e:
            st.error(f"❌ Lỗi kết nối Supabase: {e}")
            return

    if not result:
        st.warning("Chưa có dữ liệu. GitHub Actions sẽ tự đồng bộ sau.")
        return

    df_full   = pd.DataFrame([dataclasses.asdict(i) for i in result])
    cols_show = [c for c in display_cols if c in df_full.columns]

    # ── Metrics ──────────────────────────────────────────
    m1, m2, m3 = st.columns(3)
    m1.metric(f"Tổng {label}s", f"{len(df_full):,}")
    if "status" in df_full.columns:
        n_active = (df_full["status"].str.lower() == "active").sum()
        m2.metric("Active", f"{n_active:,}")
        m3.metric("Inactive", f"{len(df_full) - n_active:,}")

    st.write("")

    # ── Filter bar ───────────────────────────────────────
    with st.container(border=True):
        c1, c2, c3 = st.columns([4, 1, 1])
        search        = c1.text_input("search", placeholder=f"🔍 Tìm kiếm trong {len(result):,} {label}s...", label_visibility="collapsed", key=f"search_{table}")
        tenant_filter = c2.selectbox("Tenant", ["Tất cả", "VN", "US"], label_visibility="collapsed", key=f"tenant_{table}")
        status_filter = c3.selectbox("Status", ["Tất cả", "Active", "Inactive"], label_visibility="collapsed", key=f"status_{table}")

    # ── Apply filters ────────────────────────────────────
    df_view = df_full[cols_show].copy()
    if tenant_filter != "Tất cả" and "tenant" in df_view.columns:
        df_view = df_view[df_view["tenant"] == tenant_filter]
    if status_filter != "Tất cả" and "status" in df_view.columns:
        df_view = df_view[df_view["status"] == status_filter]
    df_view = local_search(df_view, search, cols_show)

    if len(df_view) < len(df_full):
        st.caption(f"Hiển thị **{len(df_view):,}** / {len(df_full):,} {label}s")

    col_cfg = {k: v for k, v in COL_CFG.items() if k in cols_show}
    st.dataframe(df_view, use_container_width=True, height=500, column_config=col_cfg)

    # ── Downloads ────────────────────────────────────────
    st.divider()
    dl1, dl2 = st.columns(2)
    fname = f"{fname_prefix}_all"
    with dl1:
        buf = io.StringIO()
        df_full.to_csv(buf, index=False, encoding="utf-8-sig")
        st.download_button("⬇️ Download CSV", use_container_width=True,
                           data=buf.getvalue().encode("utf-8-sig"),
                           file_name=f"{fname}.csv", mime="text/csv",
                           key=f"csv_{table}")
    with dl2:
        import json as _json
        js = _json.dumps([dataclasses.asdict(i) for i in result], ensure_ascii=False, indent=2)
        st.download_button("⬇️ Download JSON", use_container_width=True,
                           data=js.encode("utf-8"),
                           file_name=f"{fname}.json", mime="application/json",
                           key=f"json_{table}")

    # ── Detail viewer ────────────────────────────────────
    with st.expander(f"🔎 Xem chi tiết 1 {label}"):
        keys     = [getattr(i, detail_key) for i in result]
        selected = st.selectbox(f"Chọn {detail_key}", keys, key=f"detail_{table}")
        if selected:
            obj = next((i for i in result if getattr(i, detail_key) == selected), None)
            if obj:
                st.json(dataclasses.asdict(obj))


# ─────────────────────────────────────────────────────────
# Tab 0-3: Explorer pages
# ─────────────────────────────────────────────────────────
for _i in range(4):
    with tabs[_i]:
        render_explorer(_i)

# ─────────────────────────────────────────────────────────
# Tab 4: Chatbot
# ─────────────────────────────────────────────────────────
QUICK_QUESTIONS = [
    "Có bao nhiêu gói SIM cho Việt Nam?",
    "eSIM Nhật Bản 5GB rẻ nhất bao nhiêu?",
    "Gói nào hỗ trợ hotspot?",
    "Gói data không giới hạn có không?",
]

with tabs[4]:
    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = []
    if "chat_context" not in st.session_state:
        st.session_state.chat_context = ""

    if not st.session_state.chat_context:
        with st.spinner("Đang tải dữ liệu sản phẩm..."):
            try:
                products = [Product.from_dict(r) for r in load_table("products")]
                skus     = [Sku.from_dict(r)     for r in load_table("skus")]
                st.session_state.chat_context = build_context(products, skus)
                st.session_state._chat_info = f"{len(products):,} products · {len(skus):,} SKUs"
            except Exception as e:
                st.error(f"❌ Lỗi tải dữ liệu: {e}")

    # Header row
    h1, h2 = st.columns([5, 1])
    with h1:
        st.subheader("🤖 Chatbot Hỗ Trợ Sale")
        if st.session_state.chat_context:
            st.caption(f"Dữ liệu: {st.session_state.get('_chat_info', '')} · refresh sau 30 phút")
    with h2:
        if st.button("🗑️ Xóa chat", use_container_width=True):
            st.session_state.chat_messages = []
            st.rerun()

    # Quick questions (chỉ khi chưa có chat)
    if not st.session_state.chat_messages and st.session_state.chat_context:
        st.markdown("**Gợi ý câu hỏi:**")
        qq_cols = st.columns(len(QUICK_QUESTIONS))
        for col, q in zip(qq_cols, QUICK_QUESTIONS):
            if col.button(q, use_container_width=True, key=f"qq_{q[:20]}"):
                st.session_state.chat_messages.append({"role": "user", "content": q})
                with st.spinner("Đang xử lý..."):
                    try:
                        reply = get_gemini_response(st.session_state.chat_messages, st.session_state.chat_context)
                        st.session_state.chat_messages.append({"role": "assistant", "content": reply})
                    except Exception as e:
                        st.session_state.chat_messages.append({"role": "assistant", "content": f"❌ Lỗi: {e}"})
                st.rerun()

    st.divider()

    # Chat history
    for msg in st.session_state.chat_messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    # Input
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
# Tab 5: Admin (admin only)
# ─────────────────────────────────────────────────────────
if role == "admin":
    with tabs[5]:
        st.subheader("👤 Quản lý Users")

        tab_list, tab_add, tab_pw = st.tabs(["Danh sách", "Thêm user", "Đổi password"])

        with tab_list:
            users = _load_users()
            if not users:
                st.info("Chưa có user nào.")
            else:
                for u in users:
                    c_info, c_role, c_save, c_del = st.columns([4, 2, 2, 1])
                    c_info.markdown(f"**{u['username']}** · {u['name']}")
                    c_info.caption(u.get("email") or "—")

                    new_role = c_role.selectbox(
                        "role", ["admin", "sale"],
                        index=0 if u["role"] == "admin" else 1,
                        key=f"role_{u['username']}",
                        label_visibility="collapsed",
                    )
                    if c_save.button("Lưu", key=f"save_{u['username']}", use_container_width=True):
                        if new_role != u["role"]:
                            _sb_admin().table("users").update({
                                "role":       new_role,
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            }).eq("username", u["username"]).execute()
                            _load_users.clear()
                            st.success(f"Đã đổi role **{u['username']}** → `{new_role}`")
                            st.rerun()
                        else:
                            st.toast("Role không thay đổi.")

                    if u["username"] != _username:
                        if c_del.button("🗑️", key=f"del_{u['username']}", help=f"Xóa {u['username']}"):
                            if st.session_state.get(f"confirm_del_{u['username']}"):
                                _sb_admin().table("users").delete().eq("username", u["username"]).execute()
                                _load_users.clear()
                                st.success(f"Đã xóa user **{u['username']}**")
                                st.session_state.pop(f"confirm_del_{u['username']}", None)
                                st.rerun()
                            else:
                                st.session_state[f"confirm_del_{u['username']}"] = True
                                st.rerun()

                    if st.session_state.get(f"confirm_del_{u['username']}"):
                        st.warning(f"Bấm 🗑️ lần nữa để xác nhận xóa **{u['username']}**, hoặc tải lại trang để hủy.")

                    st.divider()

        with tab_add:
            with st.form("form_add_user", clear_on_submit=True):
                col1, col2 = st.columns(2)
                new_username = col1.text_input("Username *")
                new_name     = col2.text_input("Tên hiển thị *")
                new_email    = col1.text_input("Email")
                new_role_opt = col2.selectbox("Role", ["sale", "admin"])
                new_pw       = col1.text_input("Password *", type="password")
                new_pw2      = col2.text_input("Nhập lại password *", type="password")
                add_submitted = st.form_submit_button("Thêm user", use_container_width=True)

            if add_submitted:
                if not new_username or not new_name or not new_pw:
                    st.error("Username, tên hiển thị và password không được để trống.")
                elif new_pw != new_pw2:
                    st.error("Password không khớp.")
                elif any(u["username"] == new_username for u in _load_users()):
                    st.error(f"Username **{new_username}** đã tồn tại.")
                else:
                    hashed = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt(12)).decode()
                    _sb_admin().table("users").insert({
                        "username": new_username,
                        "name":     new_name,
                        "email":    new_email,
                        "role":     new_role_opt,
                        "password": hashed,
                    }).execute()
                    _load_users.clear()
                    st.success(f"Đã thêm user **{new_username}** (`{new_role_opt}`)")
                    st.rerun()

        with tab_pw:
            users = _load_users()
            with st.form("form_change_pw", clear_on_submit=True):
                target_user = st.selectbox("Username", [u["username"] for u in users])
                col1, col2 = st.columns(2)
                chg_pw  = col1.text_input("Password mới *", type="password")
                chg_pw2 = col2.text_input("Nhập lại *", type="password")
                pw_submitted = st.form_submit_button("Đổi password", use_container_width=True)

            if pw_submitted:
                if not chg_pw:
                    st.error("Password không được để trống.")
                elif chg_pw != chg_pw2:
                    st.error("Password không khớp.")
                else:
                    hashed = bcrypt.hashpw(chg_pw.encode(), bcrypt.gensalt(12)).decode()
                    _sb_admin().table("users").update({
                        "password":   hashed,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("username", target_user).execute()
                    _load_users.clear()
                    st.success(f"Đã đổi password cho **{target_user}**")
