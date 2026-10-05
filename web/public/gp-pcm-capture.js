// Gấu Pro phiên trực tiếp (G5): mic Float32 → PCM 16-bit, gửi từng khối 1600 mẫu (100ms @16kHz).
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]))
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.buffer, [this.buf.buffer]); this.buf = new Int16Array(1600); this.n = 0 }
    }
    return true
  }
}
registerProcessor("pcm-capture", PcmCapture)
