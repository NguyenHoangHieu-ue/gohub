// Tab "Giám sát Dữ liệu" đã gộp vào trang "Dữ liệu & API" (s202) — tab con "Giám sát".
import { redirect } from "next/navigation"
export default function DataHealthRedirect() {
  redirect("/analytics/creator/devtools?tab=monitor")
}
