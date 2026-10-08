import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ASSISTANT_FEATURES, FEATURE_ROLES, loadFeatureMatrix, saveFeatureMatrix } from "@/lib/assistant-features"

// Bảng phân quyền tính năng trợ lý theo vai trò (U3). Xem: creator/admin; sửa: chỉ creator.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !["creator", "admin"].includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ features: ASSISTANT_FEATURES, roles: FEATURE_ROLES, matrix: await loadFeatureMatrix() })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ error: "Forbidden — Creator only" }, { status: 403 })
  try {
    return NextResponse.json({ ok: true, matrix: await saveFeatureMatrix(await req.json()) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
