"use client"

import { Wrench } from "lucide-react"

export default function NccPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <Wrench className="w-12 h-12 text-amber-500" />
      <h2 className="text-xl font-semibold text-gray-700">Hiện đang bảo trì</h2>
      <p className="text-gray-500">Vui lòng thử lại sau.</p>
    </div>
  )
}
