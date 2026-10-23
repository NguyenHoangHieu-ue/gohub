"use client"
import { installFetchCache } from "@/lib/client-fetch-cache"

// Gắn lớp fetch dùng chung (dedupe + nhớ ngắn hạn + xoá khi ghi) cho cả vùng đăng nhập. Gắn ngay khi module được nạp
// (effect của con chạy TRƯỚC effect của cha nên đặt trong useEffect sẽ chậm một nhịp so với lần fetch đầu).
installFetchCache()

export function FetchCacheInstaller() { return null }
