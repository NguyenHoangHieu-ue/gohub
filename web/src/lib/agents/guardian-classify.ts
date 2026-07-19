import type { GuardCategory } from "./guardian"

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAN CLASSIFIER — XÁC ĐỊNH (regex, KHÔNG gọi LLM).
//
// Trước đây phân loại nhạy cảm bằng 1 call Gemini temp0 → CÙNG 1 câu lúc cho qua,
// lúc bị chặn ("lúc được lúc không") + tốn 1 vòng LLM mỗi tin nhắn. Nay dùng regex
// có anchor → quyết định ỔN ĐỊNH và nhanh hơn. Nguyên tắc: chọn mức nhạy cảm CAO
// NHẤT câu chạm tới; không match nhóm nhạy cảm nào → general (cho qua — nới tối đa).
//
// Tách file leaf (không import supabase) để test thuần, nhanh, không cần env.
// ─────────────────────────────────────────────────────────────────────────────

export function normG(s: string): string {
  return (s || "").toLowerCase().replace(/đ/g, "d").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
}

// TẤN CÔNG / jailbreak / vượt quyền / lộ nội bộ prompt → luôn system_internal.
const RE_INJECT = /ignore (the )?(previous|above|all|prior)|disregard (the )?(previous|above|instruction)|forget (the |your )?(rule|instruction|prompt|everything)|bo qua (moi |cac |het )?(chi dan|huong dan|quy tac|lenh|rule|nguyen tac)|quen (di |het )?(quy tac|chi dan|lenh|rule|nhiem vu|nguyen tac)|you are now|ban (bay )?gio (la|se la|dong vai)|act as (an? )?(admin|developer|root|system)|dong vai (admin|quan tri|nha phat trien|he thong)|toi la (admin|sep|quan tri|creator|nguoi tao|chu he thong)|toi co (quyen|full quyen|toan quyen|quyen admin)|toi duoc phep (xem|truy cap|biet)|sep (bao|noi|nho|keu|yeu cau)|hieu (nho|bao|keu|noi|yeu cau) toi|(cho|show|liet ke|xem|in ra|tiet lo)[a-z ]{0,16}(quy tac|luat|rule|prompt|system (prompt|instruction)|chi dan cua ban|noi dung chi dan)|prompt cua (ban|may|bot|he thong|con)|system (prompt|instruction)|bypass|jailbreak|\boverride\b|vuot quyen|khai thac (bot|he thong|lo hong)|in a story|trong (mot )?cau chuyen|gia su ban (la|dong vai)|gia vo (la|rang)|pretend|role.?play|dich (cau|doan|nguyen) sau|translate this/

// Kỹ thuật/build hệ thống (không phải nghiệp vụ) → system_internal.
const RE_SYS_TECH = /ma nguon|source code|\bcodebase\b|\brepo(sitory)?\b|github|api key|credential|secret key|bien moi truong|\benv\b|database schema|schema (bang|database|db)|cau truc (bang|database|co so du lieu|bang du lieu)|truy van sql|\bsql\b|ten (cac )?bang|cot trong bang|api endpoint|endpoint (nao|gi)|stack cong nghe|cong nghe (nao|gi)|framework (nao|gi|nao duoc)|thu vien (nao|gi)|ngon ngu (lap trinh|nao)|dung (model ai|model gi|ai gi|gemini|gpt|framework|thu vien)|model (ai )?(nao|gi)|deploy|hosting|ha tang|kien truc (he thong|phan mem|ky thuat)|ci.?cd|devops|(he thong|website|web|app|ung dung|chatbot|con bot|bot nay|con ai|con gau|no) (nay )?(duoc |bi )?(build|xay dung|lap trinh|tao ra|phat trien|code|thiet ke|van hanh|hoat dong|phan loai|train|huan luyen) (ra sao|nhu the nao|the nao|nao|bang gi|bang cach nao|gi)|\bprompt\b|system instruction/

// Nghiệp vụ (được phép) — chặn không cho RE_SYS_TECH bắt nhầm.
const RE_BIZ_PROC = /\bkyc\b|tao (san pham|sku|product|listing|item|goi)|quy trinh (tao|xu ly|ban|kinh doanh|nghiep vu|kyc|hoan|doi tra)|xu ly don|chinh sach (gia|ban|hoan|doi tra|khuyen mai)|cach doc ma|doc ma sku|y nghia (cua )?ma/

// Giá vốn / biên lợi nhuận → margin_cogs.
const RE_COGS = /\bcogs\b|gia von|gia nhap|gia goc|gia dau vao|bien (loi nhuan|lai)|ty suat loi nhuan|\bmargin\b|gross profit|\bgpm2?\b|\bcm1\b|\bgp2\b|contribution margin|loi nhuan|lai gop|lai rong|lo (rong|gop)|chenh lech gia (von|nhap|goc)/

// Lương / nhân sự / hiệu suất nhân viên → staff_hr.
const RE_HR = /\bluong\b|tien luong|bang luong|thu nhap (cua )?(nhan vien|nv|nhan su)|thuong (tet|le|nong)|tien thuong|hieu suat (lam viec )?(cua )?(nhan vien|nv|sales|nhan su)|xep hang (nhan vien|nv|sales)|danh gia (nhan vien|nv|nhan su)|kpi (cua )?(nhan vien|nv|sales)|\bnhan su\b|ho so nhan vien|cham cong|nghi phep|nhan vien nao (ban|lam|dat) (nhieu|gioi|tot|cao) ?nhat|sales nao (ban|gioi|nhieu) ?nhat|ai (la nguoi )?(ban|lam) (gioi|nhieu) ?nhat/

// PII khách hàng → customer_pii (Lark group chặn; web cho qua).
const RE_PII = /danh sach khach hang|so (dien thoai|dt) (cua )?khach|sdt (cua )?khach|email (cua )?khach|thong tin (ca nhan )?(cua )?khach|khach hang nao (mua|dat|chi) (nhieu|cao) ?nhat|top khach hang|khach (hang )?vip|ho so khach|dia chi (cua )?khach|lien he (cua )?khach/

// Doanh thu/BI & sản phẩm — đều allow, chỉ để gán nhãn đúng (tôn trọng custom policy).
const RE_REVENUE = /doanh thu|doanh so|don hang|so luong ban|ban duoc bao nhieu|kenh ban|\btarget\b|du phong|fulfillment|revenue|hieu suat kenh|\bb2b\b|\bb2c\b/
const RE_PRODUCT = /\bgoi\b|\bsim\b|esim|san pham|\bsku\b|gia ban|catalog|vendor|\bncc\b|worldmove|3hk|nuoc|quoc gia|khu vuc|listing/

export interface ClassifyOut {
  category:           GuardCategory
  target_department?: string
  confidence:         number
}

// Phân loại nhạy cảm HOÀN TOÀN XÁC ĐỊNH (cùng câu → cùng category).
// Ưu tiên: injection > system_internal > cogs > hr > pii > revenue > product > general.
export function classifySensitivity(message: string): ClassifyOut {
  const t = normG(message)
  if (RE_INJECT.test(t))                           return { category: "system_internal", confidence: 1.0 }
  if (RE_SYS_TECH.test(t) && !RE_BIZ_PROC.test(t)) return { category: "system_internal", confidence: 0.95 }
  if (RE_COGS.test(t))                             return { category: "margin_cogs",     confidence: 0.9 }
  if (RE_HR.test(t))                               return { category: "staff_hr",        confidence: 0.9 }
  if (RE_PII.test(t))                              return { category: "customer_pii",    confidence: 0.9 }
  if (RE_REVENUE.test(t))                          return { category: "revenue_bi",      confidence: 0.85 }
  if (RE_PRODUCT.test(t))                          return { category: "product_catalog", confidence: 0.85 }
  return { category: "general", confidence: 0.8 }
}
