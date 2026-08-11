-- v34: Tổ Gấu — Group Chat nội bộ (Phase 1 MVP: text only)

-- chat_groups
CREATE TABLE IF NOT EXISTS chat_groups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  description    text,
  avatar_emoji   text DEFAULT '🐻',
  created_by     text NOT NULL,
  ai_enabled     boolean DEFAULT true,
  ai_scope       text,
  ai_system_prompt_append text,
  notify_lark    boolean DEFAULT true,
  is_archived    boolean DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- chat_group_members
CREATE TABLE IF NOT EXISTS chat_group_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_email  text NOT NULL,
  user_name   text,
  role        text DEFAULT 'member',
  added_by    text,
  added_at    timestamptz DEFAULT now(),
  UNIQUE(group_id, user_email)
);

-- chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_email  text NOT NULL,
  sender_name   text NOT NULL,
  content       text NOT NULL,
  msg_type      text DEFAULT 'text',
  attachments   jsonb DEFAULT '[]',
  reply_to      uuid REFERENCES chat_messages(id),
  is_pinned     boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_group_created ON chat_messages(group_id, created_at DESC);

-- chat_docs (Phase 3)
CREATE TABLE IF NOT EXISTS chat_docs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  file_url      text,
  file_name     text,
  file_size     bigint,
  file_type     text,
  tags          text[] DEFAULT '{}',
  uploaded_by   text NOT NULL,
  uploader_name text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_docs_group ON chat_docs(group_id, created_at DESC);

-- chat_notes (Phase 3)
CREATE TABLE IF NOT EXISTS chat_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  content      text NOT NULL,
  created_by   text NOT NULL,
  creator_name text,
  is_pinned    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_notes_group ON chat_notes(group_id, created_at DESC);
