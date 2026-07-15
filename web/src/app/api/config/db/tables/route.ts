import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// Creator-only: liệt kê toàn bộ bảng trong Supabase (đọc OpenAPI spec của PostgREST tại /rest/v1/).
// Chỉ trả tên bảng — đếm số dòng làm riêng khi mở từng bảng (tránh N query nặng lúc load).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Forbidden — Creator only" }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase env chưa cấu hình" }, { status: 500 })

  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!res.ok) return NextResponse.json({ error: `Supabase trả ${res.status}` }, { status: 502 })
    const spec = await res.json()
    const defs = (spec?.definitions ?? {}) as Record<string, unknown>
    // definitions chứa cả bảng lẫn view; bỏ các key bắt đầu bằng "rpc/" (hàm), giữ phần còn lại.
    const tables = Object.keys(defs)
      .filter(name => !name.startsWith("rpc/"))
      .sort((a, b) => a.localeCompare(b))
    return NextResponse.json({ tables })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
