import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { redirect }         from "next/navigation"
import { Sidebar }          from "@/components/sidebar"
import { SidebarMain }      from "@/components/sidebar-main"
import { SidebarProvider }  from "@/components/sidebar-context"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <SidebarMain>{children}</SidebarMain>
      </div>
    </SidebarProvider>
  )
}
