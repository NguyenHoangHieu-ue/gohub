// s195+18: streaming thật dùng chung cho Bé Gấu (be-gau.ts) + Gấu Pro (creator-ai.ts) — trước đó cả 2
// agent await xong TOÀN BỘ vòng lặp function-calling mới trả 1 cục text cho user (root cause "im lặng
// rồi bung nguyên cục" — s195+14 chỉ vá triệu chứng bằng nâng maxDuration, chưa fix gốc).
//
// generateContentStream() mỗi vòng (kể cả vòng có tool-call) thay vì generateContent(). Vòng tool-call
// thường KHÔNG có text (model chỉ gọi hàm, system prompt cấm narrate bước kỹ thuật) nên forward chunk
// không lộ gì; vòng trả lời cuối thì text stream thẳng ra user theo từng đoạn model sinh ra. Trả về CÙNG
// SHAPE { response } như generateContent() để code downstream (.text()/.functionCalls()/.candidates)
// không đổi gì. Retry chỉ áp dụng khi CHƯA emit chunk nào ra user trong vòng này — tránh lặp lại text đã hiện.
//
// s195+18-B (fix KHẨN, phát hiện qua QA My Metrics): SDK @google/generative-ai v0.21.0
// (node_modules/@google/generative-ai/dist/index.js hàm aggregateResponses) khi gộp nhiều chunk stream
// thành 1 response CHỈ copy đúng 4 field cố định mỗi part (text/functionCall/executableCode/
// codeExecutionResult) — làm RỚT field `thoughtSignature` (SDK ra đời trước field này, model "thinking"
// dùng tool như gemini-3.8-flash mới cần). Gemini API BẮT BUỘC phải echo lại đúng thoughtSignature khi
// gửi lại chính functionCall đó ở lượt sau (đẩy vào `contents` cho vòng lặp tool-calling tiếp theo) —
// thiếu → toàn bộ vòng lặp tool-calling of cả Bé Gấu lẫn Gấu Pro chết ngay 400 "Function call is
// missing a thought_signature" NGAY KHI vừa đổi sang streaming (bug có từ lúc merge s195+18, không ai
// phát hiện vì lỗi nằm trong luồng SSE, không hiện rõ như lỗi HTTP thường). Tự gom `parts` từ RAW chunk
// (spread giữ NGUYÊN mọi field, không lọc như SDK) rồi ghi đè vào `content.parts` của response đã
// aggregate — `.text()`/`.functionCalls()` của SDK đọc thẳng `candidates[0].content.parts` mỗi lần gọi
// (không cache tại thời điểm addHelpers), nên ghi đè sau vẫn hoạt động đúng.
export async function genWithRetryStream(
  model: any,
  request: any,
  onChunk?: (text: string) => void,
  attempts = 3,
): Promise<any> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    let emittedAny = false
    const rawParts: any[] = []
    try {
      const result = await model.generateContentStream(request)
      for await (const chunk of result.stream) {
        const delta = chunk.text?.()
        if (delta) { emittedAny = true; onChunk?.(delta) }
        const parts = chunk.candidates?.[0]?.content?.parts
        if (parts) for (const p of parts) rawParts.push({ ...p })
      }
      const aggregated = await result.response
      if (aggregated.candidates?.[0]) {
        aggregated.candidates[0].content = {
          role: aggregated.candidates[0].content?.role || "model",
          parts: rawParts,
        }
      }
      return { response: aggregated }
    } catch (e: any) {
      lastErr = e
      const transient = /429|rate|quota|resource.?exhausted|500|503|overload|unavailable|deadline|timeout|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(String(e?.message || ""))
      if (emittedAny || !transient || i === attempts - 1) throw e
      await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }
  }
  throw lastErr
}
