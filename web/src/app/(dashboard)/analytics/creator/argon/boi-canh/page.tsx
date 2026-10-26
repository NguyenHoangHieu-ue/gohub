import { redirect } from "next/navigation"

// Kế hoạch và bối cảnh đã gộp vào tab Hôm nay (giữ địa chỉ cũ để link cũ còn mở được).
export default function BoiCanhRedirect() {
  redirect("/analytics/creator/argon#ke-hoach-box")
}
