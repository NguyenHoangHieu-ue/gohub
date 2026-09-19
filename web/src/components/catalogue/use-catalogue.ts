"use client"

import { useCallback, useEffect, useState } from "react"
import type { CatalogueIndex, CatalogueProductDetail } from "@/lib/catalogue/types"

/** Tải chỉ mục danh mục 1 lần cho cả trang. `reload(true)` ép tính lại (nocache=1) để lấy dữ liệu mới nhất. */
export function useCatalogueIndex() {
  const [data, setData] = useState<CatalogueIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/analytics/product-catalogue${fresh ? "?nocache=1" : ""}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu")
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  return { data, error, loading, reload: load }
}

/** Chi tiết 1 gói (mở ngăn chi tiết). Huỷ kết quả cũ nếu người dùng bấm gói khác nhanh. */
export function useProductDetail(code: string | null) {
  const [detail, setDetail] = useState<CatalogueProductDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!code) { setDetail(null); return }
    let cancelled = false
    setLoading(true); setError(null); setDetail(null)
    fetch(`/api/analytics/product-catalogue/${encodeURIComponent(code)}`)
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được chi tiết") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [code])

  return { detail, error, loading }
}
