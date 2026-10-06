import { accessListRoute, MARKET_USERS_KEY } from "@/lib/creator-access"

// Creator cấp/thu quyền xem tab Thị trường & Báo giá (danh sách app_settings.market_users).
export const { GET, POST } = accessListRoute(MARKET_USERS_KEY, "market_access")
