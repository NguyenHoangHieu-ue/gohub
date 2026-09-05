// Tab "SQL Explorer" đã gộp vào tab "API & Database" (/analytics/creator/devtools, tab con "SQL Query").
import { redirect } from "next/navigation"
export default function SqlExplorerRedirect() {
  redirect("/analytics/creator/devtools")
}
