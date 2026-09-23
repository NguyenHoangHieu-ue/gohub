import type { GPEvent, WebSource } from "../types"
import { TOOL_STATUS }             from "../types"
import { visibleTables }           from "./supabase"

import { runReadKnowledgeBase, runWriteKnowledgeBase, runSearchKnowledgeBase, runReviewPendingLearning, runApproveLearning, runRejectLearning } from "./knowledge"
import { runExecuteSQL }           from "./sql"
import { runQuerySupabase, runQueryProduct } from "./supabase"
import { runQueryGA4, runQueryGSC } from "./analytics"
import { runGenerateImage, runGenerateImageStability, runGetTrendSnapshots } from "./image"
import { runLarkTask, runLarkBase } from "./lark"
import { runSendLarkMessage }      from "./lark-send"
import { runBrowsePortal, runManagePortalCredentials } from "./portal"
import { runBrowseWeb }            from "./browser"
import { runWebSearchTool }        from "./search"
import { runCompareVendorQuotes }  from "./compare-quotes"
import { runTrackSKUWinRate }      from "./win-rate"
import { runGenerateVideo, runCheckVideoStatus } from "./video"
import { runReadMyBrowser, runControlMyBrowser, runLocalFiles } from "./bridge"
import { runGoogleWorkspace } from "./google"
import { logGpAction }             from "./audit-log"
import { runVerifyReportNumbers }  from "./self-review"

// Tool có tác dụng phụ ra ngoài (ghi KB/Lark/portal/browser thật) — audit trail (s196+6).
const AUDITED_TOOLS = new Set([
  "writeKnowledgeBase", "approveLearning", "rejectLearning",
  "createLarkTask", "updateLarkTask", "sendLarkMessage",
  "controlMyBrowser", "managePortalCredentials", "localFiles", "googleWorkspace",
])

export async function dispatchTool(
  call: { name: string; args: any },
  onEvent: ((e: GPEvent) => void) | undefined,
  collectedSources: WebSource[],
  ctx?: { username?: string; isCreator?: boolean },
): Promise<{ functionResponse: { name: string; response: any } }> {
  const result = await dispatchToolCore(call, onEvent, collectedSources, ctx)
  if (AUDITED_TOOLS.has(call.name)) {
    // await (không fire-and-forget) — serverless có thể đóng execution context giữa vòng lặp
    // tool-call cuối trước khi insert kịp gửi đi (đúng bài học app_usage_events/logChat s195+18-C).
    await logGpAction({ username: ctx?.username || "", tool: call.name, args: call.args, response: result.functionResponse.response })
  }
  return result
}

async function dispatchToolCore(
  call: { name: string; args: any },
  onEvent: ((e: GPEvent) => void) | undefined,
  collectedSources: WebSource[],
  ctx?: { username?: string; isCreator?: boolean },
): Promise<{ functionResponse: { name: string; response: any } }> {
  const isCreator = ctx?.isCreator === true
  // Emit status event
  const statusMsg = call.name === "webSearch"
    ? `🌐 Đang tìm kiếm: "${(call.args?.query || "").slice(0, 60)}"`
    : call.name === "browsePortal"
      ? `🔗 Đang truy cập portal ${call.args?.portal_name || ""}...`
      : call.name === "browseWeb"
        ? (call.args?.urls?.length
            ? `🌐 Đang mở ${call.args.urls.length} trang...`
            : call.args?.pagination
              ? `🌐 Đang duyệt nhiều trang: ${(call.args?.url || "").slice(0, 50)}...`
              : `🌐 Đang mở trang ${(call.args?.url || "").slice(0, 60)}...`)
        : TOOL_STATUS[call.name] ?? "⚙️ Đang xử lý..."
  onEvent?.({ type: "status", text: statusMsg })

  const wrap = (resp: any) => ({ functionResponse: { name: call.name, response: resp } })

  if (call.name === "readKnowledgeBase")
    return wrap(await runReadKnowledgeBase(call.args?.category))

  if (call.name === "writeKnowledgeBase")
    return wrap(await runWriteKnowledgeBase(call.args))

  if (call.name === "searchKnowledgeBase")
    return wrap(await runSearchKnowledgeBase(call.args))

  if (call.name === "reviewPendingLearning")
    return wrap(await runReviewPendingLearning(call.args?.limit || 20))

  if (call.name === "approveLearning")
    return wrap(await runApproveLearning(call.args))

  if (call.name === "rejectLearning")
    return wrap(await runRejectLearning(call.args))

  if (["listLarkTasks","listLarkTasklists","getLarkTask","createLarkTask","updateLarkTask"].includes(call.name))
    return wrap(await runLarkTask(call.name, call.args))

  if (call.name === "queryLarkBase")
    return wrap(await runLarkBase(call.args))

  if (call.name === "browsePortal") {
    console.log(`[CreatorAI] browsePortal: ${call.args?.portal_name}`)
    return wrap(await runBrowsePortal(call.args))
  }

  if (call.name === "browseWeb")
    return wrap(await runBrowseWeb(call.args))

  if (call.name === "readMyBrowser")
    return wrap(await runReadMyBrowser(call.args, ctx?.username || "", onEvent))

  if (call.name === "controlMyBrowser")
    return wrap(await runControlMyBrowser(call.args, ctx?.username || "", onEvent))

  if (call.name === "localFiles")
    return wrap(ctx?.isCreator ? await runLocalFiles(call.args, ctx?.username || "", onEvent) : { error: "localFiles chỉ dành cho creator." })

  if (call.name === "googleWorkspace")
    return wrap(ctx?.isCreator ? await runGoogleWorkspace(call.args) : { error: "googleWorkspace chỉ dành cho creator." })

  if (call.name === "managePortalCredentials")
    return wrap(await runManagePortalCredentials(call.args))

  if (call.name === "sendLarkMessage")
    return wrap(await runSendLarkMessage(call.args))

  if (call.name === "compareVendorQuotes")
    return wrap(await runCompareVendorQuotes(call.args))

  if (call.name === "trackSKUWinRate")
    return wrap(await runTrackSKUWinRate(call.args))

  if (call.name === "generateVideo") {
    const resp = await runGenerateVideo(call.args, onEvent)
    return wrap({
      ...resp,
      instruction: resp.error
        ? `Video generation failed: ${resp.error}. Tell Hiếu and suggest rephrasing the prompt.`
        : resp.task_id
          ? `Include the markdown field as-is in your response. Tell Hiếu they can ask "checkVideoStatus ${resp.task_id}" sau ~2 phút.`
          : "Include the markdown field EXACTLY as-is in your response so the UI renders the video link.",
    })
  }

  if (call.name === "checkVideoStatus") {
    const resp = await runCheckVideoStatus(call.args)
    return wrap({
      ...resp,
      instruction: resp.error
        ? `Check failed: ${resp.error}.`
        : "Include the markdown field EXACTLY as-is in your response.",
    })
  }

  if (call.name === "generateImage") {
    const resp = await runGenerateImage(call.args)
    return wrap({
      ...resp,
      instruction: resp.error
        ? `Image generation failed: ${resp.error}. Tell Hiếu and suggest rephrasing the prompt.`
        : "Include the markdown field EXACTLY as-is in your response — it contains the base64 image that the UI will render. Do NOT modify or truncate it.",
    })
  }

  if (call.name === "generateImageStability") {
    const resp = await runGenerateImageStability(call.args)
    return wrap({
      ...resp,
      instruction: resp.error
        ? `Image generation failed: ${resp.error}. Báo Hiếu lỗi này.`
        : "Include the markdown field EXACTLY as-is in your response — it contains the image URL. Do NOT modify or truncate it.",
    })
  }

  if (call.name === "getTrendSnapshots")
    return wrap(await runGetTrendSnapshots(call.args))

  if (call.name === "webSearch")
    return wrap(await runWebSearchTool(call.args?.query || "", collectedSources))

  if (call.name === "listSupabaseTables")
    return wrap({ tables: visibleTables(isCreator) })

  if (call.name === "querySupabase")
    return wrap(await runQuerySupabase(call.args, isCreator))

  if (call.name === "queryGA4")
    return wrap(await runQueryGA4(call.args))

  if (call.name === "queryGSC")
    return wrap(await runQueryGSC(call.args))

  if (call.name === "queryProduct")
    return wrap(await runQueryProduct(call.args))

  if (call.name === "executeSQL") {
    const resp = await runExecuteSQL(call.args?.sql || "", call.args?.bypass_cache === true)
    return wrap(resp)
  }

  if (call.name === "verifyReportNumbers")
    return wrap(await runVerifyReportNumbers(call.args))

  return wrap({ error: "Unknown tool" })
}
