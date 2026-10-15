// Target B2B theo ORGANIZATION (Hiếu chốt 2026-10-15): Organization có >1 mã KH thì chỉ nhập target ở cấp Organization, các mã con KHÔNG nhập riêng.
// Lưu cùng bảng b2b_customer_targets với customer_code = "ORG::<orgKey>" (orgKey = dim_customer.organization, hoặc mã KH nếu không có organization).
// Mọi chỗ cần target từng mã (Squad Progress, bảng Tổng quan) gọi allocateOrgTargets để chia target Organization xuống các mã con theo tỷ trọng doanh thu,
// nên tổng các mã con luôn đúng bằng target Organization và code phía sau (tính %TGT, cộng squad) không phải đổi.
export const ORG_PREFIX = "ORG::"
export const orgTargetKey = (orgKey: string) => `${ORG_PREFIX}${orgKey}`

export interface Tgt { cm1: number; thk: number; rev: number; hk3rev: number }
export interface OrgMember { code: string; orgKey: string; revenue: number }

const hasTarget = (t?: Tgt) => !!t && (t.cm1 > 0 || t.thk > 0 || t.rev > 0 || t.hk3rev > 0)

/** Chia số nguyên `total` theo trọng số, tổng đúng bằng total (dư dồn vào phần lớn nhất). */
function splitInt(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  const w = sum > 0 ? weights : weights.map(() => 1)
  const wSum = sum > 0 ? sum : weights.length
  const out = w.map(x => Math.floor((total * x) / wSum))
  let rest = Math.round(total) - out.reduce((s, v) => s + v, 0)
  const order = w.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]]++
  return out
}

/**
 * raw = target thô từ DB (khoá theo mã KH và "ORG::<orgKey>"). Trả target hiệu lực THEO MÃ KH (không còn khoá ORG::):
 *  - Organization >1 mã KH có target riêng → chia xuống mã con theo doanh thu (target nhập tay ở mã con của org đó bị bỏ qua, tránh tính trùng);
 *  - còn lại → target của chính mã đó (tương thích số liệu cũ).
 */
export function allocateOrgTargets(raw: Record<string, Tgt>, members: OrgMember[]): Record<string, Tgt> {
  const out: Record<string, Tgt> = {}
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith(ORG_PREFIX)) out[k] = v
  const byOrg = new Map<string, OrgMember[]>()
  for (const m of members) byOrg.set(m.orgKey, [...(byOrg.get(m.orgKey) ?? []), m])
  for (const [orgKey, group] of Array.from(byOrg)) {
    const t = raw[orgTargetKey(orgKey)]
    if (group.length < 2 || !hasTarget(t)) continue
    const w = group.map(m => Math.max(0, m.revenue))
    const rev = splitInt(t.rev, w), cm1 = splitInt(t.cm1, w), hk3 = splitInt(t.hk3rev, w)
    group.forEach((m, i) => { out[m.code] = { rev: rev[i], cm1: cm1[i], hk3rev: hk3[i], thk: t.thk } })
  }
  return out
}

/** Số mã KH của mỗi Organization (để biết mã nào thuộc Organization nhiều mã → không nhập target riêng). */
export function orgSizes(members: OrgMember[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of members) m.set(x.orgKey, (m.get(x.orgKey) ?? 0) + 1)
  return m
}
