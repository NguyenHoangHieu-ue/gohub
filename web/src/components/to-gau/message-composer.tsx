"use client"

// Tách từ to-gau/[id]/page.tsx (s196+19, đề xuất G roadmap audit Tổ Gấu s196+5 — file đã tách s183
// xuống ~1224 dòng nhưng leo lại lên 1419 sau các tính năng thêm sau đó: paste ảnh, reply/thread,
// streaming...). Tách CƠ HỌC — chỉ move nguyên khung JSX + prop hoá state/handler, KHÔNG đổi logic.
import React from "react"
import { Paperclip, Bot, Send, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/to-gau/avatar"
import { FilePreviewItem } from "@/components/to-gau/file-preview"
import type { ChatMessage, Member } from "@/lib/to-gau-types"

export function MessageComposer({
  isArchived, replyTarget, setReplyTarget, selectedFiles, removeSelectedFile,
  showMentionDropdown, mentionSuggestions, mentionIdx, setMentionIdx, selectMention,
  fileInputRef, handleFileChange, textareaRef, content, handleContentChange, handleKeyDown,
  showAIButton, askAI, askingAI, sending, uploading, sendMessage,
}: {
  isArchived: boolean
  replyTarget: ChatMessage | null
  setReplyTarget: (m: ChatMessage | null) => void
  selectedFiles: File[]
  removeSelectedFile: (idx: number) => void
  showMentionDropdown: boolean
  mentionSuggestions: Member[]
  mentionIdx: number
  setMentionIdx: (idx: number) => void
  selectMention: (member: Member) => void
  fileInputRef: React.RefObject<HTMLInputElement>
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  textareaRef: React.RefObject<HTMLTextAreaElement>
  content: string
  handleContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  showAIButton: boolean
  askAI: () => void
  askingAI: boolean
  sending: boolean
  uploading: boolean
  sendMessage: () => void
}) {
  if (isArchived) {
    return (
      <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-[13px] text-slate-400">
        Nhóm đã lưu trữ — không thể gửi tin nhắn mới
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3">
      {/* Reply preview bar (s196+15) */}
      {replyTarget && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-slate-50 border-l-2 border-brand-400">
          <div className="flex-1 min-w-0 text-[12px] text-slate-500 truncate">
            Trả lời <span className="font-medium text-brand-600">{replyTarget.sender_name}</span>
            {": "}{replyTarget.content.slice(0, 100)}
          </div>
          <button onClick={() => setReplyTarget(null)} className="flex-shrink-0 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      )}
      {/* File preview row */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedFiles.map((file, idx) => (
            <FilePreviewItem key={idx} file={file} onRemove={() => removeSelectedFile(idx)} />
          ))}
        </div>
      )}

      {/* @mention dropdown */}
      {showMentionDropdown && mentionSuggestions.length > 0 && (
        <div className="mb-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {mentionSuggestions.map((member, idx) => (
            <button
              key={member.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectMention(member) }}
              onMouseEnter={() => setMentionIdx(idx)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left",
                idx === mentionIdx ? "bg-brand-50" : "hover:bg-brand-50"
              )}
            >
              <Avatar name={member.user_name} email={member.user_email} size="sm" />
              <div>
                <p className="text-[13px] font-medium text-slate-700">{member.user_name || member.user_email}</p>
                <p className="text-[11px] text-slate-400">{member.user_email}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Paperclip button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          className="flex-shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50 hover:text-brand-600 disabled:opacity-40 transition-colors"
          title="Đính kèm file"
        >
          <Paperclip size={15} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.xlsx,.docx,.txt"
          className="hidden"
          onChange={handleFileChange}
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tin nhắn... (Enter gửi, Shift+Enter xuống dòng, @ để mention)"
          rows={1}
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 resize-none max-h-32 overflow-y-auto"
          style={{ minHeight: "42px" }}
        />

        {/* AI button */}
        {showAIButton && (
          <button
            type="button"
            onClick={askAI}
            disabled={(!content.trim() && selectedFiles.length === 0) || askingAI || sending || uploading}
            title="Hỏi AI Gấu Tổ (gõ chữ hoặc đính kèm ảnh để bot xem)"
            className="flex-shrink-0 w-9 h-9 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {askingAI ? (
              <span className="text-[13px] animate-pulse">🤖</span>
            ) : (
              <Bot size={15} />
            )}
          </button>
        )}

        {/* Send button */}
        <button
          onClick={sendMessage}
          disabled={(!content.trim() && selectedFiles.length === 0) || sending || uploading}
          className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {(sending || uploading) ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  )
}
