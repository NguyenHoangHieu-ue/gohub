import { accessListRoute } from "@/lib/creator-access"
import { ARGON_USERS_KEY } from "@/lib/argon/access-pure"

// Người được Creator cấp dùng Trợ lý (Argon) ở mức member: Hỏi + Kho + Việc cần duyệt của chính họ (không số liệu công ty/SQL/code, không chạy nền; có hạn mức mỗi ngày). Chỉ Creator quản lý.
export const dynamic = "force-dynamic"
export const { GET, POST } = accessListRoute(ARGON_USERS_KEY, "argon-access")
