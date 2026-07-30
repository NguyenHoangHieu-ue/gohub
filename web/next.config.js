/** @type {import('next').NextConfig} */
const nextConfig = {
  // docx, xlsx run only on server (API routes) — exclude from webpack client bundle
  serverExternalPackages: ["docx"],
}
module.exports = nextConfig
