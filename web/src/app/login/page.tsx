"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [username, setUsername]       = useState("")
  const [password, setPassword]       = useState("")
  const [loading, setLoading]         = useState(false)
  const [larkLoading, setLarkLoading] = useState(false)
  const [error, setError]             = useState("")
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const result = await signIn("credentials", { username, password, redirect: false })
      if (result?.ok) {
        router.push("/chatbot")
      } else {
        setError("Sai tên đăng nhập hoặc mật khẩu.")
        setLoading(false)
      }
    } catch (err) {
      setError("Hiếu đang fix, vui lòng đợi")
      setLoading(false)
    }
  }

  const handleLarkLogin = async () => {
    setLarkLoading(true)
    setError("")
    try {
      await signIn("lark", { callbackUrl: "/chatbot" })
    } catch (err) {
      setError("Hiếu đang fix, vui lòng đợi")
      setLarkLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 via-blue-700 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/15 rounded-2xl mb-4 backdrop-blur-sm border border-white/20">
            <span className="text-3xl">📡</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">GoHub PM</h1>
          <p className="text-blue-100/80 text-sm mt-1">Product Manager Dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Đăng nhập</h2>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tên đăng nhập
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="username"
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mật khẩu
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 select-none">hoặc</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Lark login button */}
          <button
            type="button"
            onClick={handleLarkLogin}
            disabled={larkLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white border border-[#1456F0] text-[#1456F0] font-semibold rounded-xl hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1456F0] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {/* Lark icon (inline SVG) */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="24" cy="24" r="24" fill="#1456F0" />
              <text
                x="24"
                y="31"
                textAnchor="middle"
                fontSize="22"
                fontWeight="bold"
                fill="white"
                fontFamily="Arial, sans-serif"
              >
                L
              </text>
            </svg>
            {larkLoading ? "Đang chuyển hướng..." : "Đăng nhập bằng Lark"}
          </button>
        </div>
      </div>
    </div>
  )
}
