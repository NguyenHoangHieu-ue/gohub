import type { WebSource } from "@/lib/web-search"
export type { WebSource }

export interface FileContext {
  name:      string
  type:      "text" | "image" | "pdf"
  content:   string
  mimeType?: string
  extraText?: string
}

export type GPEvent =
  | { type: "status"; text: string }
  | { type: "text"; content: string }
  | { type: "done"; conversationId: string | null; sources: WebSource[]; summarized: boolean }
  | { type: "error"; message: string }

export const TOOL_STATUS: Record<string, string> = {
  executeSQL:              "⚙️ Đang query analytics database...",
  querySupabase:           "📊 Đang đọc dữ liệu Supabase...",
  listSupabaseTables:      "📋 Đang liệt kê tables...",
  queryGA4:                "📈 Đang query Google Analytics...",
  queryGSC:                "🔍 Đang query Google Search Console...",
  queryProduct:            "📦 Đang tra cứu sản phẩm...",
  generateImage:           "🎨 Đang tạo ảnh...",
  getTrendSnapshots:       "📡 Đang đọc trend data...",
  listLarkTasks:           "✅ Đang đọc Lark tasks...",
  listLarkTasklists:       "✅ Đang đọc Lark task lists...",
  getLarkTask:             "✅ Đang đọc task detail...",
  createLarkTask:          "✅ Đang tạo Lark task...",
  updateLarkTask:          "✅ Đang cập nhật Lark task...",
  queryLarkBase:           "📋 Đang đọc Lark Base...",
  managePortalCredentials: "🔑 Đang quản lý credentials...",
  readKnowledgeBase:       "📚 Đang đọc Knowledge Base...",
  writeKnowledgeBase:      "💾 Đang cập nhật Knowledge Base...",
  reviewPendingLearning:   "🔍 Đang đọc pending learning...",
  approveLearning:         "✅ Đang approve learning...",
  rejectLearning:          "❌ Đang reject learning...",
  sendLarkMessage:         "📨 Đang gửi Lark message...",
  compareVendorQuotes:     "💱 Đang so sánh báo giá NCC...",
  trackSKUWinRate:         "📊 Đang tính Win Rate SKU...",
}
