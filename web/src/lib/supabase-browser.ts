import { createClient } from "@supabase/supabase-js"

// Client Supabase cho TRÌNH DUYỆT (chỉ khoá anon công khai). KHÔNG import "@/lib/supabase" trong client component: file đó tạo thêm client admin
// cần SUPABASE_SERVICE_KEY (chỉ có ở server) nên sập ngay khi nạp trang. Dùng cho tải file thẳng lên Storage bằng đường ký sẵn (token đã cấp quyền).
export const supabaseBrowser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
