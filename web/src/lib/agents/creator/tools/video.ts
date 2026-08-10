const KLING_BASE = "https://api.klingai.com"

async function klingFetch(path: string, options?: RequestInit) {
  const key = process.env.KLING_API_KEY
  if (!key) throw new Error("KLING_API_KEY chưa set")
  const res = await fetch(`${KLING_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  })
  return res.json()
}

function buildVideoMarkdown(videoUrl: string, cover: string): string {
  return [
    "🎬 **Video đã tạo xong!**",
    "",
    `[▶️ Xem / Tải video](${videoUrl})`,
    "",
    cover ? `![Thumbnail](${cover})` : "",
    "",
    "> ⚠️ URL tạm thời — hãy tải về ngay.",
  ].filter(Boolean).join("\n")
}

async function pollUntilDone(
  taskId: string,
  pollPath: string,
  maxPolls = 12,
): Promise<{ markdown?: string; task_id?: string; error?: string }> {
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 10_000))
    let res: any
    try { res = await klingFetch(pollPath) } catch { continue }
    if (res.code !== 0) continue

    const status = res.data?.task_status
    if (status === "succeed") {
      const videoUrl = res.data?.task_result?.videos?.[0]?.url
      const cover    = res.data?.task_result?.videos?.[0]?.cover_image_url ?? ""
      if (!videoUrl) return { error: "Video xong nhưng không có URL." }
      return { markdown: buildVideoMarkdown(videoUrl, cover) }
    }
    if (status === "failed") {
      return { error: `Kling thất bại: ${res.data?.task_status_msg ?? "unknown"}` }
    }
  }
  // Timeout — trả task_id để Gấu hướng dẫn checkVideoStatus
  return {
    task_id: taskId,
    markdown: `⏳ Video đang render (task_id: \`${taskId}\`). Gọi \`checkVideoStatus\` sau 1-2 phút để lấy kết quả.`,
  }
}

export async function runGenerateVideo(args: {
  prompt: string
  negative_prompt?: string
  aspect_ratio?: string
  duration?: number
  mode?: string
}): Promise<{ markdown?: string; task_id?: string; error?: string }> {
  if (!process.env.KLING_API_KEY) return { error: "KLING_API_KEY chưa set trên Vercel." }

  let createRes: any
  try {
    createRes = await klingFetch("/v1/videos/text2video", {
      method: "POST",
      body: JSON.stringify({
        model_name:      "kling-v1-6",
        prompt:          args.prompt,
        negative_prompt: args.negative_prompt ?? "",
        cfg_scale:       0.5,
        mode:            args.mode ?? "std",
        aspect_ratio:    args.aspect_ratio ?? "16:9",
        duration:        String(args.duration ?? 5),
      }),
    })
  } catch (e: any) {
    return { error: `Kling API error: ${e.message}` }
  }

  if (createRes.code !== 0) {
    return { error: `Kling lỗi (${createRes.code}): ${createRes.message ?? JSON.stringify(createRes)}` }
  }

  const taskId = createRes.data?.task_id
  if (!taskId) return { error: "Không nhận được task_id từ Kling." }

  return pollUntilDone(taskId, `/v1/videos/text2video/${taskId}`, 12)
}

export async function runCheckVideoStatus(args: { task_id: string }): Promise<{ markdown?: string; error?: string }> {
  if (!process.env.KLING_API_KEY) return { error: "KLING_API_KEY chưa set." }

  let res: any
  try { res = await klingFetch(`/v1/videos/text2video/${args.task_id}`) }
  catch (e: any) { return { error: e.message } }

  if (res.code !== 0) return { error: res.message ?? "API error" }

  const status = res.data?.task_status
  if (status === "succeed") {
    const videoUrl = res.data?.task_result?.videos?.[0]?.url
    const cover    = res.data?.task_result?.videos?.[0]?.cover_image_url ?? ""
    return { markdown: buildVideoMarkdown(videoUrl, cover) }
  }
  if (status === "failed") return { error: `Thất bại: ${res.data?.task_status_msg}` }

  return { markdown: `⏳ Đang xử lý (status: ${status}). Thử lại sau 1-2 phút.` }
}
