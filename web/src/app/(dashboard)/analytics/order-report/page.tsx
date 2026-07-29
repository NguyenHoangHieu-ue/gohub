// Tab "Order Report" đã được gộp vào tab "Orders" (/analytics/orders).
import { redirect } from "next/navigation"
export default function OrderReportRedirect() {
  redirect("/analytics/orders")
}
