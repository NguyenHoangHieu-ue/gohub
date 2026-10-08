import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ASSISTANT_FEATURES, loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"

// U3: tính năng Bé Gấu đang bật cho vai trò người dùng hiện tại (giao diện chat hiện/ẩn nút theo đây).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const m = await loadFeatureMatrix()
  return NextResponse.json({ features: ASSISTANT_FEATURES.filter(f => featureEnabled(m, f.id, session.user.role)).map(f => f.id) })
}
