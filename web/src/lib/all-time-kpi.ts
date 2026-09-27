// KPI tổng của All-Time Report: Total Revenue / GPM% / CM1% cho TOÀN BỘ khoảng ngày đang lọc.
// Tính từ dòng số liệu thô (revenue, margin, CM1 tuyệt đối) — KHÔNG từ dữ liệu chart của metric đang chọn
// (trước đây 3 ô lấy trung bình của chart nên "Avg GPM %" ra "5022889133.18%" khi chart đang là doanh thu).
// Tỷ suất = tổng tử / tổng doanh thu (bình quân có trọng số doanh thu), không phải trung bình cộng các tháng.

export interface AllTimeRow {
  group_name: string
  revenue: number | string
  margin: number | string
  gpm2_val: number | string
}

// Cùng 3 nhóm mà bảng/chart của trang hiển thị (nhóm 'Other' như đơn nội bộ không nằm trong bảng nên không cộng vào KPI).
const SHOWN_GROUPS = new Set(["B2B-Strategic", "B2B-Non-Strategic", "B2C"])

export function allTimeKpis(rows: AllTimeRow[] | undefined | null) {
  let revenue = 0, margin = 0, cm1 = 0
  for (const r of rows ?? []) {
    if (!SHOWN_GROUPS.has(r.group_name)) continue
    revenue += Number(r.revenue) || 0
    margin += Number(r.margin) || 0
    cm1 += Number(r.gpm2_val) || 0
  }
  return {
    revenue,
    gpmPct: revenue > 0 ? (margin / revenue) * 100 : 0,
    cm1Pct: revenue > 0 ? (cm1 / revenue) * 100 : 0,
  }
}
