// s195+18: streaming thật dùng chung cho Bé Gấu (be-gau.ts) + Gấu Pro (creator-ai.ts) — trước đó cả 2
// agent await xong TOÀN BỘ vòng lặp function-calling mới trả 1 cục text cho user (root cause "im lặng
// rồi bung nguyên cục" — s195+14 chỉ vá triệu chứng bằng nâng maxDuration, chưa fix gốc).
//
// generateContentStream() mỗi vòng (kể cả vòng có tool-call) thay vì generateContent(). Vòng tool-call
// thường KHÔNG có text (model chỉ gọi hàm, system prompt cấm narrate bước kỹ thuật) nên forward chunk
// không lộ gì; vòng trả lời cuối thì text stream thẳng ra user theo từng đoạn model sinh ra. Trả về CÙNG
// SHAPE { response } như generateContent() để code downstream (.text()/.functionCalls()/.candidates)
// không đổi gì. Retry chỉ áp dụng khi CHƯA emit chunk nào ra user trong vòng này — tránh lặp lại text đã hiện.
export async function genWithRetryStream(
  model: any,
  request: any,
  onChunk?: (text: string) => void,
  attempts = 3,
): Promise<any> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    let emittedAny = false
    try {
      const result = await model.generateContentStream(request)
      for await (const chunk of result.stream) {
        const delta = chunk.text?.()
        if (delta) { emittedAny = true; onChunk?.(delta) }
      }
      return { response: await result.response }
    } catch (e: any) {
      lastErr = e
      const transient = /429|rate|quota|resource.?exhausted|500|503|overload|unavailable|deadline|timeout|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(String(e?.message || ""))
      if (emittedAny || !transient || i === attempts - 1) throw e
      await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }
  }
  throw lastErr
}
