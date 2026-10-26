import { redirect } from "next/navigation"

// "Trò chuyện" đã gộp vào tab "Hỏi" (/hoi-tim): một nơi để hỏi + tìm. Giữ đường dẫn cũ (và ?q=) để link/dấu trang cũ vẫn chạy.
export default function TroLyRedirect({ searchParams }: { searchParams: { q?: string } }) {
  redirect(`/analytics/creator/argon/hoi-tim${searchParams.q ? `?q=${encodeURIComponent(searchParams.q)}` : ""}`)
}
