import { B2CAdvancedDashboard } from "@/components/b2c-advanced-dashboard"

// B2C-1 (tạm): tách dashboard tùy biến (GA4/leads/spend) ra component để bảo toàn.
// B2C-2 sẽ thay đây bằng wrapper: view chính = port intel B2CPerformance + nút "Advanced" (admin)
// bật tab phụ = B2CAdvancedDashboard này.
export default function B2CPage() {
  return <B2CAdvancedDashboard />
}
