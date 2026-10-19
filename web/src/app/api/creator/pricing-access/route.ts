import { accessListRoute, PRICING_USERS_KEY } from "@/lib/creator-access"

// Creator cấp/thu quyền "Tính giá" ở tab Tính giá & Tạo sản phẩm (app_settings.pricing_users).
export const { GET, POST } = accessListRoute(PRICING_USERS_KEY, "pricing_access")
