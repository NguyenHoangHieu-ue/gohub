import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { redirect }         from "next/navigation"
import { Sidebar }          from "@/components/sidebar"
import { SidebarMain }      from "@/components/sidebar-main"
import { SidebarProvider }  from "@/components/sidebar-context"
import { HeartbeatProvider } from "@/components/heartbeat-provider"
import { ToastProvider }     from "@/components/toast"
import { SearchShortcut }   from "@/components/search-shortcut"
import { CommandPalette }   from "@/components/command-palette"
import { TrackPageView }    from "@/components/track-page-view"
import { FetchCacheInstaller } from "@/components/fetch-cache-installer"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  return (
    <ToastProvider>
      <SidebarProvider>
        <FetchCacheInstaller />
        <HeartbeatProvider />
        <TrackPageView />
        <SearchShortcut />
        <CommandPalette />
        <div className="flex min-h-screen">
          <Sidebar />
          <SidebarMain>{children}</SidebarMain>
        </div>
      </SidebarProvider>
    </ToastProvider>
  )
}
