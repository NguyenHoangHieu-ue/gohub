/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only packages — exclude from webpack client bundle
  serverExternalPackages: ["docx", "mammoth"],
  // Skip type-check và ESLint trong next build để tránh OOM (codebase lớn ~2GB heap).
  // Type-check được chạy riêng qua: npx.cmd tsc --noEmit
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
module.exports = nextConfig
