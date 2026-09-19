"use client"

import React, { useState } from "react"
import { ChevronDown, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Unrecognized } from "@/lib/catalogue/auto-names"

/** Chỉ admin/creator thấy: dữ liệu có giá trị MỚI. Trang vẫn hiện bình thường (tên tạm/nguyên gốc), banner nhắc bổ sung tên chuẩn. */
export function UnrecognizedNotice({ u }: { u: Unrecognized }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 text-sm text-sky-900">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            Có <b>{u.total}</b> giá trị mới trong dữ liệu sản phẩm chưa có tên chuẩn. Trang vẫn hiển thị bình thường
            <span className="text-sky-700"> (chỉ admin/creator thấy thông báo này)</span>.
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-sky-200 px-4 py-3 text-sky-900">
          {u.vendors.length > 0 && (
            <li>
              <b>Nhà cung cấp mới:</b>{" "}
              {u.vendors.map(v => `${v.code} (đang tạm gọi "${v.tempName}", ${v.products} gói)`).join("; ")}.
              {" "}Thêm tên chuẩn ở Admin → Import ref data (bảng <code>ref_vendors</code>) hoặc vào bảng tên trong <code>plain-language.ts</code>.
            </li>
          )}
          {u.sims.length > 0 && <li><b>Loại SIM mới:</b> {u.sims.join(", ")} — đang hiện nguyên tên gốc; muốn tên tiếng Việt thì thêm vào <code>simLabel</code>.</li>}
          {u.dataKinds.length > 0 && <li><b>Kiểu tính dung lượng mới:</b> {u.dataKinds.join(", ")} — đang hiện nguyên tên gốc; thêm mô tả ở <code>dataKindLabel</code>.</li>}
          {u.statuses.length > 0 && <li><b>Trạng thái mới:</b> {u.statuses.join(", ")} — gói này bị coi là <u>không bán</u> (ẩn mặc định) cho tới khi khai báo trong <code>SELLABLE_STATUSES</code>.</li>}
          {u.countries.length > 0 && <li><b>Mã nước chưa có trong ref_countries:</b> {u.countries.join(", ")} — vẫn hiện tên theo chuẩn quốc tế nhưng nằm nhóm "Khác".</li>}
        </ul>
      )}
    </div>
  )
}
