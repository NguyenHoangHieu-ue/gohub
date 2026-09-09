"use client"

// Wave 0.4 — URL-state cho filter/search.
// Lưu filter vào URL searchParams → F5/back-button/chia sẻ link giữ nguyên bộ lọc.
//
// Dùng 1 key:
//   const [search, setSearch] = useUrlState("q")
//   const [tab, setTab]       = useUrlState("tab", "countries", 0)  // debounce=0 cho select/tab
//
// Dùng nhiều key cùng lúc (ít roundtrip hơn):
//   const [f, setF] = useUrlStates({ q: "", vendor: "", sim: "" })
//   setF({ vendor: "WM" })  ← chỉ patch key thay đổi

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

export function useUrlState(key: string, defaultValue = "", debounce = 300) {
  const params   = useSearchParams()
  const router   = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(() => params.get(key) ?? defaultValue)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync khi URL thay đổi ngoài (back/forward button)
  useEffect(() => {
    setValue(params.get(key) ?? defaultValue)
  }, [params, key, defaultValue])

  const update = useCallback((newVal: string) => {
    setValue(newVal)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString())
      if (!newVal || newVal === defaultValue) p.delete(key)
      else p.set(key, newVal)
      const qs = p.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
    }, debounce)
  }, [params, router, pathname, key, defaultValue, debounce])

  return [value, update] as const
}

type StringRecord = Record<string, string>

export function useUrlStates<T extends StringRecord>(defaults: T, debounce = 300) {
  const params   = useSearchParams()
  const router   = useRouter()
  const pathname = usePathname()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const readValues = useCallback(
    () => Object.fromEntries(Object.keys(defaults).map(k => [k, params.get(k) ?? defaults[k]])) as T,
    [params, defaults] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const [values, setValues] = useState<T>(readValues)

  useEffect(() => { setValues(readValues()) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch: Partial<T>) => {
    setValues(prev => {
      const next = { ...prev, ...patch }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const p = new URLSearchParams(params.toString())
        for (const k of Object.keys(next)) {
          const v   = next[k]
          const def = defaults[k] ?? ""
          if (!v || v === def) p.delete(k)
          else p.set(k, v)
        }
        const qs = p.toString()
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
      }, debounce)
      return next
    })
  }, [params, router, pathname, defaults, debounce]) // eslint-disable-line react-hooks/exhaustive-deps

  return [values, update] as const
}
