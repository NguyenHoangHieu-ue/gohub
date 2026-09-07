// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).

export interface Attachment {
  url:     string
  name:    string
  size:    number
  type:    string
}

export interface ChatMessage {
  id:           string
  group_id:     string
  sender_email: string
  sender_name:  string
  content:      string
  msg_type:     string
  created_at:   string
  is_pinned?:   boolean
  edited_at?:   string | null
  is_recalled?: boolean
  attachments?: Attachment[]
}

export interface Member {
  id:         string
  user_email: string
  user_name:  string | null
  role:       string
  added_at:   string
}

export interface GroupInfo {
  id:                  string
  name:                string
  description:         string | null
  avatar_emoji:        string
  created_by:          string
  is_archived:         boolean
  members:             Member[]
  ai_enabled?:         boolean
  ai_scope?:           string | null
  my_member_role?:     string | null
}

// Phase 3 interfaces
export interface DocItem {
  id:            string
  group_id:      string
  title:         string
  description:   string | null
  file_url:      string | null
  file_name:     string | null
  file_size:     number | null
  file_type:     string | null
  tags:          string[]
  uploaded_by:   string
  uploader_name: string | null
  created_at:    string
}

export interface NoteItem {
  id:           string
  group_id:     string
  content:      string
  created_by:   string
  creator_name: string | null
  is_pinned:    boolean
  created_at:   string
  updated_at:   string
}

export interface QuestionItem {
  id:               string
  group_id:         string
  question:         string
  asked_by:         string
  asked_by_name:    string | null
  status:           "chua" | "dang" | "da_xu_ly"
  answer:           string | null
  answered_by:      string | null
  answered_by_name: string | null
  created_at:       string
  updated_at:       string
}

export interface WikiPage {
  id:               string
  title:            string
  page_type:        string
  department:       string
  tags:             string[]
  version:          number
  is_hidden:        boolean
  visibility_mode:  string
  created_by:       string
  updated_by:       string
  updated_at:       string
  content?:         string
}

export interface WikiVersion {
  id:         string
  version:    number
  updated_by: string
  updated_at: string
}

export interface GroupOption {
  id:   string
  name: string
}

export const WIKI_PAGE_TYPES: Record<string, string> = {
  vendor_profile: "Vendor",
  product_guide:  "Sản phẩm",
  process_sop:    "Quy trình",
  pricing_rule:   "Giá",
  meeting_note:   "Họp",
  reference:      "Tham chiếu",
  note:           "Ghi chú",
}

export const EMOJI_OPTIONS = ["🐻", "🦊", "🐼", "🐨", "🦁", "🐯", "🦋", "🌟", "🎯", "🚀", "💡", "🎉"]

export const AI_SCOPE_PRESETS = [
  {
    label: "Sale",
    value: "Chỉ trả lời về giá bán, tình trạng SP, SKU code, so sánh gói. KHÔNG tiết lộ COGS/margin.",
  },
  {
    label: "BD",
    value: "Trả lời về specs kỹ thuật, thông tin thị trường, báo giá so sánh. KHÔNG tiết lộ chiến lược.",
  },
  {
    label: "Ops",
    value: "Trả lời về quy trình nhập hàng, tracking, trạng thái kho. KHÔNG tiết lộ chi phí vận hành.",
  },
  { label: "Full", value: "" },
]
