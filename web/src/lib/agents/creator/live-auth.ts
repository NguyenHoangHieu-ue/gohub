import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { loadGpAllowed } from "@/lib/gp-access"
import { personalFeaturesEnabled } from "@/lib/assistant-memory-auto"

// Người dùng được dùng phiên Live (G5): có quyền Gấu Pro + cờ gp_personal_features (thử nghiệm — hiện chỉ creator).
export async function liveUser(): Promise<{ username: string; isCreator: boolean } | null> {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  const isCreator = session.user.role === "creator"
  if (!isCreator && !(await loadGpAllowed()).includes(username)) return null
  if (!(await personalFeaturesEnabled(isCreator).catch(() => false))) return null
  return { username, isCreator }
}
