/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only packages — exclude from webpack client bundle
  serverExternalPackages: ["docx", "mammoth"],
}
module.exports = nextConfig
