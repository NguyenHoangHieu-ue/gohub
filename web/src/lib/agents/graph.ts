import type { AgentId } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// CAPABILITY GRAPH — kho lưu trữ dạng đồ thị để CHỌN AGENT một cách XÁC ĐỊNH.
//
// Vì sao có file này: routing cũ dựa vào 1 lời gọi Gemini (classify) + chuỗi
// regex override đè nhau → CÙNG 1 câu lúc ra agent này, lúc ra agent khác
// ("lúc trả lời được, lúc không"). Graph này biến việc chọn agent thành hàm
// THUẦN, XÁC ĐỊNH của các tín hiệu (signals) rút từ câu hỏi:
//
//     signal ──(edge, tier)──▶ intent ──▶ agent
//
// Mỗi edge có `tier` (độ mạnh) — mô phỏng đúng thứ tự ưu tiên của cascade cũ để
// KHÔNG regress test routing. LLM classify chỉ là 1 "lá phiếu" tier thấp nhất
// (tie-break khi KHÔNG có tín hiệu xác định) → tín hiệu mạnh luôn thắng LLM,
// nên cùng 1 câu luôn ra cùng agent.
//
// Đa-agent: nếu câu chạm ≥2 intent MẠNH thuộc agent khác nhau (có liên từ) →
// trả về nhiều agent để orchestrator chạy song song rồi tổng hợp.
// ─────────────────────────────────────────────────────────────────────────────

export type IntentId =
  | "product_search"   // tìm gói GoHub theo nước/khu vực/ngày/GB → tu-van
  | "product_lookup"   // tra mã SKU/Product/Listing/Item cụ thể → tra-cuu
  | "price_cogs"       // giá vốn / COGS / tỷ giá → tra-cuu
  | "explain_group"    // "AP2 là gì / gồm nước nào" → giai-dap (tier cao)
  | "system_explain"   // giải thích thuật ngữ / cấu trúc / chính sách → giai-dap
  | "ncc_catalog"      // xem catalog NCC (WM/3HK) → gap-analysis
  | "gap_analysis"     // NCC có mà GoHub chưa tạo → gap-analysis
  | "template_create"  // tạo/xuất template Excel → tao-template
  | "bi_analytics"     // doanh thu/đơn/kênh/nhân viên → bi-analyst
  | "usage_3hk"        // lượng tiêu thụ data 3HK → bi-analyst
  | "data_explore"     // đếm/liệt kê/thống kê dữ liệu thô nhiều bảng → data-explorer
  | "greeting"         // chào hỏi / cảm ơn → giai-dap

export const INTENT_AGENT: Record<IntentId, AgentId> = {
  product_search:  "tu-van",
  product_lookup:  "tra-cuu",
  price_cogs:      "tra-cuu",
  explain_group:   "giai-dap",
  system_explain:  "giai-dap",
  ncc_catalog:     "gap-analysis",
  gap_analysis:    "gap-analysis",
  template_create: "tao-template",
  bi_analytics:    "bi-analyst",
  usage_3hk:       "bi-analyst",
  data_explore:    "data-explorer",
  greeting:        "giai-dap",
}

// Domain của mỗi agent — đa-agent chỉ kích hoạt khi 2 intent KHÁC domain.
const DOMAIN: Record<AgentId, string> = {
  "tu-van":        "catalog",
  "tra-cuu":       "catalog",
  "gap-analysis":  "catalog",
  "tao-template":  "catalog",
  "bi-analyst":    "analytics",
  "data-explorer": "analytics",
  "giai-dap":      "knowledge",
}

// Thứ tự ưu tiên tie-break (index 0 = thắng khi cùng tier). Mô phỏng cascade cũ:
// template > explain-group > data_explore > usage/BI > gap > code-lookup > ncc > pricing/cogs > explain > product > greeting.
const PRECEDENCE: IntentId[] = [
  "template_create", "explain_group", "data_explore", "usage_3hk", "bi_analytics",
  "gap_analysis", "product_lookup", "ncc_catalog", "price_cogs", "system_explain",
  "product_search", "greeting",
]
const rank = (i: IntentId) => PRECEDENCE.indexOf(i)

// ─── Signal flags (phần XÁC ĐỊNH — rút từ extractParams ở router) ─────────────
export interface SignalFlags {
  hasCode:      boolean   // có mã SKU/Product/Listing
  hasCountry:   boolean
  hasRegion:    boolean
  hasGroupCode: boolean
  hasVendorNcc: boolean   // nhắc WM/3HK/NCC (dataSource=ncc_catalog)
  isUnlimited:  boolean
}

// ─── Từ khoá (chuẩn hoá: bỏ dấu, lowercase) — port từ router cũ để giữ hành vi ─
const RE = {
  template:  /\b(tao|xuat|tai|lam|generate)\b[^.!?]*template|template[^.!?]*\b(wm|3hk|wordmove|worldmove)\b|tao file excel|xuat file excel/,
  explainGroup: /\bla gi\b|nghia la|giai thich|(gom|bao gom)[^.!?]{0,14}(nuoc|quoc gia)/,
  // Data-explorer = ĐẾM / LIỆT KÊ / THỐNG KÊ / CẤU HÌNH dữ liệu thô (catalog/config/KB/internal).
  // Noun-anchored để KHÔNG cướp câu BI tài chính ("doanh thu bao nhiêu" — không có noun catalog).
  dataExplore: /kho du lieu|tra du lieu|truy xuat du lieu|bang du lieu|liet ke bang|data explorer|(co )?bao nhieu[a-z_ ]{0,12}(sku|san ?pham|product_?type|listing|item|nuoc|quoc gia|vendor|ncc|datapool|zone|wiki|tai lieu|\bkb\b|category|danh muc|ma nhom|target|ke hoach|kpi|feedback|snapshot|lich gui|ticket|hoi thoai|tin nhan|notification|thong bao|chunk|version|\bfile\b|tai khoan|nguoi dung|\buser\b|ghi chu|ban ghi|cong ty|don vi)|dem (so )?(sku|san ?pham|listing|item|nuoc|vendor|ncc|\buser\b|nguoi dung|category|tai lieu|ticket|\bfile\b|hoi thoai|notification)|liet ke[a-z_ ]{0,16}(wiki|trang wiki|san ?pham|sku|listing|item|nuoc|vendor|ncc|tai lieu|\bkb\b|category|danh muc|ma nhom|target|feedback|snapshot|ticket|hoi thoai|notification|\bfile\b|tai khoan|nguoi dung|\buser\b|ghi chu|zone|cau hinh|chi phi|datapool)|thong ke[a-z_ ]{0,16}(catalog|san ?pham|sku|nuoc|vendor|ticket|feedback|datapool)|danh sach[a-z_ ]{0,12}(san ?pham|sku|listing|item|nuoc|vendor|ncc|tai lieu|wiki|ticket|\bfile\b|cau hinh|ma nhom|zone|category)|(co )?nhung (san ?pham|sku|listing|item|nuoc|vendor|ncc|category|ma nhom|\bfile\b|ticket|cau hinh|kenh|zone|tai lieu|datapool)[a-z_ ]{0,14}(nao|gi)|cau hinh (nhap )?chi phi|chi phi (theo )?(kenh|nhom kenh)|cost input|target planning|ke hoach target|kpi planning/,
  // Nhắc TÊN BẢNG tường minh (2 DB) → chắc chắn là data-explorer (agent duy nhất query mọi bảng).
  dataTable: /sync_log|dong bo du lieu|lan dong bo|lark_chat_history|lich su chat lark|kb_chunks|kb_wiki_versions|ncc_products_unified|catalog ncc hop nhat|ncc_vendor_config|data_file_registry|file du lieu ncc|b2c_report_monthly|snapshot b2c|snapshot bao cao|analytics_channel_costs|analytics_channel_group_costs|analytics_target_planning|analytics_cost_input_settings|analytics_feedbacks|analytics_conversations|analytics_messages|lark_scheduled_messages|user_notes|ghi chu ca nhan|dim_order_source|dim_location|dim_staff|dim_customer|dim_sku|dim_date|data_usage_log|fact_sales_revenue|fact_fulfillment_revenue|fact_data_usage|bang company|phap nhan|app_settings|tu ngay nao den ngay|du lieu.{0,20}tu ngay nao/,
  usage:     /luong su dung|luong dung|muc (su )?dung|su dung data|data usage|3hk data usage|tieu thu data|data tieu thu|tieu thu (data|gb)|tong luong data|luong data (tieu thu|su dung)|usage.*3hk|3hk.*usage|thong ke.*data_usage_log|query.*data_usage|usage esim|esim usage|nhom (su dung|su su dung)|nhom (unused|low|medium|high|over)|usage_class|fact_data_usage/,
  // BI KHÔNG mơ hồ với gap — luôn ép bi kể cả khi câu nhắc vendor (WM/3HK) → cho phép multi gap+bi.
  biStrong: /\bnhan vien\b|\bdoanh thu\b|\bdoanh so\b|\bfulfillment\b|\bgpm\b|\bdon hang\b|\bcm1\b|\bcogs\b|\bgross profit\b|\bmargin\b|\brevenue\b|\bprorata\b|units? sold|\bcontribution\b|\btheo kho\b|\btrong kho\b|\btai kho\b|\bo kho\b|kho (ha noi|hn|hcm|da nang|tong|sai gon|tphcm|ho chi minh)|theo chi nhanh|trong chi nhanh|bao cao.{0,20}(theo (kho|kenh|thang|quy|nhan vien|nam)|doanh thu|doanh so|ban hang)|ban[a-z0-9 ]{0,20}kenh nao|tren kenh nao|kenh nao ban|thuoc kenh nao|kenh ban nao|duoc ban (o|tren|tai|qua)|ban qua kenh|ban tren kenh|theo kenh (ban|nao)|hoa hong|thi phan.{0,16}(doanh thu|vendor|kenh)|toc do tang truong|week over week|wow|year over year|yoy|nen tang theo (tuan|thang|quy|nam)|so sanh.{0,16}(nam|thang|tuan|khi|truoc)|khach hang.{0,24}(mua lan dau|lan dau mua|khong mua|chua mua)|mua lan dau|khach hang moi|khach moi\b/,
  // BI mơ hồ với gap ("bao nhiêu gói" có thể là gap "gói chưa tạo") — chỉ ép bi khi KHÔNG có tín hiệu gap.
  biWeak: /\bban duoc bao nhieu\b|\bso luong ban\b|so luong[a-z ]{0,14}(ban ra|ban duoc|ban|xuat ban|tieu thu|da ban)|\bban ra bao nhieu\b|\bso luong ban ra\b|\blich su ban hang\b|\bso don hang\b|\bso ban\b|\bban duoc\b|\bban chua\b|\bban bao nhieu\b|\bbao nhieu (sim|esim|don|cai|goi)\b|\bso luong (ban|sim|esim|don|cai)\b/,
  rankBi:    /ban chay nhat|ban nhieu nhat|mua nhieu nhat|mua nhieu|khach.{0,12}mua nhieu|top \d* ?(sku|san pham|kenh|nhan vien|khach)|top[a-z ]{0,10}(khach hang|kenh|vendor|nhan vien)/,
  genericBi: /doanh thu|doanh so|don hang|kenh ban|nhan vien sales|fulfillment|target thang|revenue|gross profit|b2b b2c|b2b va b2c|hieu suat kenh|top sku|san pham ban chay|strategic partner|klook|traveloka|thang nay bao nhieu|tuan nay|hom nay bao nhieu|so sanh thang|ban duoc bao nhieu|so luong ban|xuat ban|lich su ban|thong ke ban hang|bao nhieu don|so don hang|mua bao nhieu|ban hang tren kenh|kenh nao ban|ban tren kenh|hieu qua ban hang|san pham ban duoc|cm1|contribution margin/,
  gap:       /\bgap\b|ncc co\b|chua co\b|chua import|chua nhap|chua tao|chua duoc.{0,12}tao|worldmove co\b|wm co\b|3hk co\b|so sanh ncc|con cung cap|con goi\b|vendor co\b/,
  pricingListing: /listing|item|gia ban|gia thi truong|sales.channel|unitprice|huong dan|kich hoat|apn|activation/,
  cogs:      /cogs|gia von|gia nhap|loi nhuan|ty gia|chi phi/,
  explain:   /nghia la|giai thich|cau truc|data policy|source type|kyc la|throttle la|vendor la|ma sku|ma nuoc|ky tu/,
  productish: /\bdi \b|tim goi|co goi|\besim\b|\bgoi\b|list|liet ke/,
  greeting:  /^(hi|hello|helu|hey|chao|xin chao|alo)\b|cam on|\bthanks?\b|thank you/,
  conjunction: /\bva\b|\bva ca\b| dong thoi | cung luc | ngoai ra | \b&\b|,|\bcon\b|\bva them\b|\bkem theo\b/,
}

// ─── Rule/edge model ──────────────────────────────────────────────────────────
// Mỗi rule = 1 edge signal→intent với `tier`. tier càng cao càng mạnh.
//   6 = action tuyệt đối (template)
//   5 = tín hiệu XÁC ĐỊNH mạnh (definite-BI / usage / data-explore / explain-group)
//   4 = mã cụ thể / gap / BI ranking
//   3 = tín hiệu vừa (BI chung / ncc / pricing / cogs / explain)
//   2 = tìm sản phẩm cơ bản / chào hỏi
//   1 = phiếu LLM (chỉ khi không có tín hiệu xác định)
interface Rule { intent: IntentId; tier: number; test: (t: string, f: SignalFlags) => boolean }

const RULES: Rule[] = [
  { intent: "template_create", tier: 6, test: (t) => RE.template.test(t) },

  { intent: "explain_group",   tier: 5, test: (t, f) => f.hasGroupCode && RE.explainGroup.test(t) },
  { intent: "data_explore",    tier: 5, test: (t, f) => RE.dataExplore.test(t) && !f.hasCode },
  { intent: "data_explore",    tier: 5, test: (t, f) => RE.dataTable.test(t) && !f.hasCode },
  { intent: "usage_3hk",       tier: 5, test: (t) => RE.usage.test(t) },
  { intent: "bi_analytics",    tier: 5, test: (t) => RE.biStrong.test(t) },                    // doanh thu/revenue… — kể cả có vendor
  { intent: "bi_analytics",    tier: 5, test: (t) => RE.biWeak.test(t) && !RE.gap.test(t) },   // bao nhiêu gói/số bán — cần tránh gap

  { intent: "gap_analysis",    tier: 4, test: (t) => RE.gap.test(t) },
  { intent: "product_lookup",  tier: 4, test: (_t, f) => f.hasCode },
  { intent: "bi_analytics",    tier: 4, test: (t, f) => RE.rankBi.test(t) && !f.hasCode && !f.hasCountry && !f.hasRegion && !f.hasGroupCode && !RE.gap.test(t) },

  { intent: "bi_analytics",    tier: 3, test: (t) => RE.genericBi.test(t) && !RE.gap.test(t) },
  { intent: "ncc_catalog",     tier: 3, test: (_t, f) => f.hasVendorNcc },
  { intent: "product_lookup",  tier: 3, test: (t) => RE.pricingListing.test(t) },
  { intent: "price_cogs",      tier: 3, test: (t) => RE.cogs.test(t) },
  { intent: "system_explain",  tier: 3, test: (t) => RE.explain.test(t) },

  { intent: "product_search",  tier: 2, test: (t, f) =>
      f.hasCountry || f.hasRegion || f.hasGroupCode || f.hasVendorNcc || f.isUnlimited || RE.productish.test(t) },
  { intent: "greeting",        tier: 2, test: (t) => RE.greeting.test(t) },
]

// Câu có liên từ ghép ("và", ",", "còn"…) → CÓ THỂ là đa-agent. Dùng cho fast-path
// ở router: khi KHÔNG có liên từ, phiếu LLM (tier-1) không thể thêm agent phụ nên
// kết quả graph không-LLM trùng khớp kết quả có-LLM ⇒ được phép bỏ qua Gemini.
export function hasConjunction(normText: string): boolean {
  return RE.conjunction.test(normText)
}

export interface GraphPick {
  intent: IntentId
  agent:  AgentId
  tier:   number
}

export interface GraphResult {
  primary: GraphPick
  /** agent phụ (đa-agent) — khác agent primary, đã lọc trùng, tối đa 2 */
  extraAgents: AgentId[]
  /** mọi intent đã kích hoạt (debug/telemetry) */
  fired: GraphPick[]
}

// Map intent LLM (classifier.IntentType) → IntentId của graph
const LLM_TO_INTENT: Record<string, IntentId> = {
  product_search: "product_search",
  product_lookup: "product_lookup",
  price_cogs:     "price_cogs",
  system_explain: "system_explain",
  ncc_catalog:    "ncc_catalog",
  gap_analysis:   "gap_analysis",
  template_create:"template_create",
  bi_analytics:   "bi_analytics",
  data_explore:   "data_explore",
  unclear:        "system_explain",
}

// So sánh 2 pick: tier cao thắng; hoà tier → precedence nhỏ (ưu tiên cao) thắng.
function better(a: GraphPick, b: GraphPick): GraphPick {
  if (a.tier !== b.tier) return a.tier > b.tier ? a : b
  return rank(a.intent) <= rank(b.intent) ? a : b
}

/**
 * Chọn agent XÁC ĐỊNH từ tín hiệu. `llm` là phiếu tier-1 (chỉ dùng khi không có
 * tín hiệu mạnh). Trả về primary + extraAgents (đa-agent) + danh sách fired.
 */
export function scoreAndSelect(
  normText: string,
  flags: SignalFlags,
  llm?: { intent: string; confidence: number },
): GraphResult {
  const fired: GraphPick[] = []

  for (const r of RULES) {
    if (r.test(normText, flags)) fired.push({ intent: r.intent, agent: INTENT_AGENT[r.intent], tier: r.tier })
  }

  // Phiếu LLM = tier 1 (chỉ thắng khi không có gì mạnh hơn)
  if (llm && llm.confidence >= 0.5) {
    const li = LLM_TO_INTENT[llm.intent]
    if (li) fired.push({ intent: li, agent: INTENT_AGENT[li], tier: 1 })
  }

  // Không có tín hiệu nào → giai-dap tổng quát (mô phỏng "unclear → giai-dap")
  if (fired.length === 0) {
    const fallback: GraphPick = { intent: "system_explain", agent: "giai-dap", tier: 0 }
    return { primary: fallback, extraAgents: [], fired: [fallback] }
  }

  // Gộp theo intent giữ tier cao nhất
  const byIntent = new Map<IntentId, GraphPick>()
  for (const p of fired) {
    const cur = byIntent.get(p.intent)
    if (!cur || p.tier > cur.tier) byIntent.set(p.intent, p)
  }
  const picks = [...byIntent.values()]

  let primary = picks[0]
  for (const p of picks) primary = better(primary, p)

  // ── Đa-agent: câu chạm ≥2 chủ đề KHÁC DOMAIN → chạy thêm agent rồi tổng hợp ──
  // Đa-agent chỉ có giá trị khi 2 intent thuộc DOMAIN khác nhau (catalog vs
  // analytics vs knowledge). Tránh false-positive: nước/mã đi kèm câu BI chỉ là
  // FILTER, không phải yêu cầu tra sản phẩm riêng.
  const hasConj = RE.conjunction.test(normText)
  const productish = RE.productish.test(normText)   // "gói/sim/đi/list" → thật sự đòi sản phẩm
  const extraAgents: AgentId[] = []
  const seen = new Set<AgentId>([primary.agent])
  const domainsCovered = new Set<string>([DOMAIN[primary.agent]])
  const secondaries = picks
    .filter(p => p.agent !== primary.agent && p.intent !== "greeting")
    .sort((a, b) => (b.tier - a.tier) || (rank(a.intent) - rank(b.intent)))

  for (const s of secondaries) {
    if (extraAgents.length >= 2) break
    if (seen.has(s.agent)) continue
    // Mã đi kèm câu BI = FILTER cho BI, KHÔNG phải lookup riêng → bỏ.
    if (primary.agent === "bi-analyst" && s.intent === "product_lookup") continue

    // Chỉ intent ĐỦ MẠNH mới đáng tách thành 1 chủ đề riêng (chạy thêm agent):
    //   · tier ≥ 4  (gap / mã cụ thể / definite-BI / data-explore / usage / explain-group / rank)
    //   · product_search KÈM từ đòi sản phẩm rõ ràng ("gói/sim/đi/list") — không chỉ vì có tên nước
    //   · system_explain ("X là gì / giải thích") đứng riêng
    // CỐ TÌNH loại tier-3 yếu (giá vốn / ncc / BI-chung) — thường là FILTER hoặc nằm trong phạm vi
    // agent primary → tránh multi thừa (vd "doanh thu VÀ lợi nhuận" không kéo thêm tra-cuu).
    const strong    = s.tier >= 4
    const productOk = s.intent === "product_search" && productish
    const explainOk = s.intent === "system_explain"
    if (!strong && !productOk && !explainOk) continue

    // Mỗi DOMAIN (catalog / analytics / knowledge) chỉ lấy 1 agent — đa-agent = spanning
    // các domain KHÁC nhau; 2 intent cùng domain để 1 agent xử lý (tránh chạy trùng).
    if (domainsCovered.has(DOMAIN[s.agent])) continue

    // Cần liên từ để tách 2 chủ đề (trừ khi cả hai đều rất mạnh tier ≥ 5).
    if (!hasConj && !(s.tier >= 5 && primary.tier >= 5)) continue

    extraAgents.push(s.agent)
    seen.add(s.agent)
    domainsCovered.add(DOMAIN[s.agent])
  }

  return { primary, extraAgents, fired: picks }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT_EXAMPLES — câu mẫu mỗi agent trả lời TỐT. Dùng cho ensureAnswer: khi bot
// bí / trả rỗng → gợi ý user cách hỏi lại đúng năng lực của agent.
// ─────────────────────────────────────────────────────────────────────────────
// Thông báo khi phải chạy nhiều agent (tổng hợp) — hiển thị cho user trước khi chờ.
export const NOTICE_MULTI =
  "⏳ Câu này cần tổng hợp từ nhiều nguồn nên hơi lâu một xíu, bạn đợi mình chút nhé…"

// ─── Phát hiện câu trả lời RỖNG / THẤT BẠI ──────────────────────────────────────
const FAILURE_RE = /hiếu đang fix|đang xử lý, vui lòng|hệ thống đang xử lý|không tìm thấy|không có dữ liệu|không có kết quả|no data|not found|lỗi (bi-analyst|data-explorer|hệ thống)/i
// "HỨA sẽ truy vấn" mà không đưa số liệu (bi né chạy SQL) = thất bại, BẤT KỂ độ dài.
const PUNT_RE = /chưa kịp|để (tôi|mình|hệ thống)[^.!?]{0,25}(truy vấn|quét)|phản hồi lại để[^.!?]{0,40}(truy vấn|quét)|chưa (thực hiện|tiến hành)[^.!?]{0,20}(truy vấn|câu lệnh)/i

export function isFailureText(text: string): boolean {
  const t = (text || "").trim()
  if (t.length < 4) return true
  if (PUNT_RE.test(t)) return true
  // Câu ngắn + chứa dấu hiệu thất bại → coi như không trả lời được.
  return t.length < 160 && FAILURE_RE.test(t)
}

// ─── Gợi ý cách hỏi (khi bot bí) — lấy ví dụ từ capability graph ─────────────────
export function guidanceFor(agentId: AgentId, understood?: string): string {
  const info = AGENT_EXAMPLES[agentId]
  const lead = understood
    ? `Mình hiểu bạn đang hỏi về **${understood}**, nhưng mình chưa tìm được dữ liệu phù hợp 😊`
    : `Mình chưa chắc trả lời đúng ý bạn 😊`
  const examples = (info?.examples ?? []).map(e => `• "${e}"`).join("\n")
  const roleLine = info ? `Mình mạnh nhất ở việc ${info.role}. ` : ""
  return `${lead}\n\n${roleLine}Bạn thử hỏi lại rõ hơn theo mấy mẫu này nhé:\n${examples}`
}

// Đảm bảo luôn có câu trả lời hữu ích: text rỗng/lỗi → thay bằng hướng dẫn.
export function ensureAnswer(text: string, agentId: AgentId, understood?: string): string {
  return isFailureText(text) ? guidanceFor(agentId, understood) : text
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT_EXAMPLES — câu mẫu mỗi agent trả lời TỐT. Dùng cho ensureAnswer/guidanceFor.
// ─────────────────────────────────────────────────────────────────────────────
export const AGENT_EXAMPLES: Record<AgentId, { role: string; examples: string[] }> = {
  "tu-van": {
    role: "tìm gói SIM/eSIM GoHub theo nước, khu vực, số ngày, dung lượng",
    examples: [
      "Đi Nhật 7 ngày có gói eSIM nào?",
      "Gói unlimited cho Hàn Quốc",
      "Sim vật lý đi Thái Lan 5 ngày 3GB",
    ],
  },
  "tra-cuu": {
    role: "tra cứu chi tiết 1 mã SKU / Product / Listing / Item (và giá vốn nếu có quyền)",
    examples: [
      "1CKORCUF01005 là mã gì?",
      "APN của mã 1CJPNWM101001",
      "Giá vốn của 1DTHATMF05010",
    ],
  },
  "giai-dap": {
    role: "giải thích thuật ngữ, cấu trúc mã, chính sách, mã nhóm nước",
    examples: [
      "KYC là gì?",
      "Cấu trúc mã SKU đọc thế nào?",
      "Mã nhóm AP2 gồm những nước nào?",
    ],
  },
  "gap-analysis": {
    role: "xem catalog nhà cung cấp (WorldMove/3HK) và cái NCC có mà GoHub chưa tạo SKU",
    examples: [
      "WorldMove có gói nào cho Nhật?",
      "WM có bao nhiêu gói chưa tạo SKU?",
      "3HK có zone nào cho Hàn Quốc?",
    ],
  },
  "tao-template": {
    role: "tạo/xuất file Excel template sản phẩm từ catalog NCC",
    examples: [
      "Tạo template WM cho Nhật Bản",
      "Xuất template 3HK cho Thái Lan",
    ],
  },
  "bi-analyst": {
    role: "phân tích kinh doanh: doanh thu, đơn hàng, kênh bán, nhân viên, target, CM1",
    examples: [
      "Doanh thu tháng này bao nhiêu?",
      "Top 5 kênh bán doanh thu cao nhất tháng 6",
      "Con 1CKORCUF01005 bán được bao nhiêu và trên kênh nào?",
    ],
  },
  "data-explorer": {
    role: "đếm / liệt kê / thống kê dữ liệu thô nhiều bảng trong hệ thống",
    examples: [
      "Có bao nhiêu SKU đang active?",
      "Liệt kê các trang wiki nội bộ",
      "Đếm số sản phẩm theo vendor",
    ],
  },
}
