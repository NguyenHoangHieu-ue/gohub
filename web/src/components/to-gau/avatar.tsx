// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { cn } from "@/lib/utils"
import { emailColor, initials } from "@/lib/to-gau-format"

export function Avatar({ name, email, size = "md" }: { name?: string | null; email: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[11px]" : size === "lg" ? "w-10 h-10 text-[14px]" : "w-8 h-8 text-[12px]"
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0", sz, emailColor(email))}>
      {initials(name, email)}
    </div>
  )
}
