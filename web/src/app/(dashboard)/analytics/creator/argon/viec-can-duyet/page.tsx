import { redirect } from "next/navigation"

// Việc cần duyệt đã gộp vào tab Hôm nay (giữ địa chỉ cũ để link/thông báo cũ còn mở được).
export default function ViecCanDuyetRedirect() {
  redirect("/analytics/creator/argon#viec-can-duyet")
}
