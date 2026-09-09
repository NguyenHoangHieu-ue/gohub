// Nạp web/.env.local vào process.env TRƯỚC khi lib/supabase khởi tạo client (module-level).
import { config } from "dotenv"
config({ path: ".env.local" })
