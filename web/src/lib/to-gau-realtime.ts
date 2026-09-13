// Client Supabase Realtime dùng CHUNG cho phòng chat Tổ Gấu ([id]/page.tsx) + 3 panel Docs/Notes/
// Questions (s196+17) — trước mỗi nơi tự tạo client riêng sẽ mở nhiều kết nối WebSocket không cần thiết
// cho cùng 1 trang. anon key đủ quyền subscribe (RLS áp dụng như đọc REST thường).
import { createClient } from "@supabase/supabase-js"

export const supabaseRealtime = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
