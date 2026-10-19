import { accessListRoute, PRODUCT_CREATE_USERS_KEY } from "@/lib/creator-access"

// Creator cấp/thu quyền "Tạo sản phẩm" ở tab Tính giá & Tạo sản phẩm (app_settings.product_create_users).
export const { GET, POST } = accessListRoute(PRODUCT_CREATE_USERS_KEY, "product_create_access")
