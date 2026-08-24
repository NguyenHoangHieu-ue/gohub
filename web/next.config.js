/** @type {import('next').NextConfig} */

// Security headers — áp cho tất cả routes.
// CSP dùng 'unsafe-inline' vì Next.js inject inline styles; 'unsafe-eval' không dùng.
const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "SAMEORIGIN" },
  { key: "X-XSS-Protection",          value: "1; mode=block" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",           // Next.js inline scripts
      "style-src 'self' 'unsafe-inline'",            // Tailwind inline styles
      "img-src 'self' data: blob: https:",           // avatars, chart images
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com https://open.larksuite.com https://image.pollinations.ai",
      "frame-ancestors 'none'",
    ].join("; "),
  },
]

const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
  // Server-only packages — TUYỆT ĐỐI không bundle vào client. pdf-parse/pdfjs-dist mang theo
  // qcms_bg.wasm (wasm-bindgen) → nếu leak vào client, browser fetch .wasm → 404 (__wbg_fetch).
  // pg = node-postgres (server DB). googleapis = GA4 server. Khai báo external = chặn tận gốc.
  serverExternalPackages: ["docx", "mammoth", "pdf-parse", "pdfjs-dist", "pg", "googleapis"],
  // Skip type-check và ESLint trong next build để tránh OOM (codebase lớn ~2GB heap).
  // Type-check được chạy riêng qua: npx.cmd tsc --noEmit
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Phòng thủ 2 lớp: nếu bất kỳ import path nào lỡ kéo package server-only vào client,
      // resolve nó thành `false` (empty module) thay vì bundle wasm/node-builtin → không 404.
      config.resolve = config.resolve || {}
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        "pdf-parse": false, "pdfjs-dist": false, pg: false, "pg-native": false,
        fs: false, net: false, tls: false, dns: false, child_process: false,
      }
    }
    return config
  },
}
module.exports = nextConfig
