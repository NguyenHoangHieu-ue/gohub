"use client"

import { useState, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react"
import { fmtVND, fmtUSD, fmtDate, fmtNum } from "@/lib/utils"

export type ColFormat = "vnd" | "usd" | "number" | "decimal" | "date" | "status"

export interface ColDef {
  key:     string
  header:  string
  format?: ColFormat
}

export interface ExtraFilter {
  field:    string
  label:    string
  type:     "select" | "range"
  options?: string[]
}

interface DataTableProps {
  data:            Record<string, unknown>[]
  columns:         ColDef[]
  filename:        string
  hiddenColumns?:  string[]
  extraFilters?:   ExtraFilter[]
}

function renderCell(value: unknown, format?: ColFormat): React.ReactNode {
  if (value === null || value === undefined || value === "")
    return <span className="text-gray-300">—</span>

  switch (format) {
    case "vnd":    return <span className="font-medium tabular-nums">{fmtVND(value)}</span>
    case "usd":    return <span className="font-medium tabular-nums">{fmtUSD(value)}</span>
    case "number": return <span className="tabular-nums">{fmtNum(value)}</span>
    case "decimal":return <span className="tabular-nums">{Number(value).toFixed(1)}</span>
    case "date":   return <span className="text-gray-500 text-xs">{fmtDate(value)}</span>
    case "status": {
      const s = String(value)
      const active = s.toLowerCase() === "active"
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
          active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>
          {s}
        </span>
      )
    }
    default:
      return (
        <span className="block max-w-[220px] truncate" title={String(value)}>
          {String(value)}
        </span>
      )
  }
}

export function DataTable({ data, columns, filename, hiddenColumns = [], extraFilters = [] }: DataTableProps) {
  const [sorting, setSorting]     = useState<SortingState>([])
  const [search, setSearch]       = useState("")
  const [statusFilter, setStatus] = useState("all")
  const [tenantFilter, setTenant] = useState("all")
  const [xSelect, setXSelect]     = useState<Record<string, string>>({})
  const [xRange, setXRange]       = useState<Record<string, [string, string]>>({})

  const visibleCols = columns.filter(c => !hiddenColumns.includes(c.key))

  const filtered = useMemo(() => {
    let d = data
    if (statusFilter !== "all")
      d = d.filter(r => String(r.status ?? "").toLowerCase() === statusFilter)
    if (tenantFilter !== "all")
      d = d.filter(r => String(r.tenant ?? "") === tenantFilter)

    for (const f of extraFilters) {
      if (f.type === "select") {
        const v = xSelect[f.field]
        if (v && v !== "all")
          d = d.filter(r => String(r[f.field] ?? "") === v)
      } else if (f.type === "range") {
        const [min, max] = xRange[f.field] ?? ["", ""]
        if (min !== "") d = d.filter(r => Number(r[f.field] ?? 0) >= Number(min))
        if (max !== "") d = d.filter(r => Number(r[f.field] ?? 0) <= Number(max))
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      d = d.filter(r =>
        visibleCols.some(c => String(r[c.key] ?? "").toLowerCase().includes(q))
      )
    }
    return d
  }, [data, statusFilter, tenantFilter, xSelect, xRange, search, visibleCols, extraFilters])

  const tableCols: ColumnDef<Record<string, unknown>>[] = visibleCols.map(c => ({
    accessorKey: c.key,
    header:      c.header,
    cell: ({ getValue }) => renderCell(getValue(), c.format),
  }))

  const table = useReactTable({
    data:           filtered,
    columns:        tableCols,
    state:          { sorting },
    onSortingChange: setSorting,
    getCoreRowModel:       getCoreRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState:   { pagination: { pageSize: 50 } },
  })

  const exportCSV = () => {
    const header = visibleCols.map(c => `"${c.header}"`).join(",")
    const rows   = filtered.map(r =>
      visibleCols.map(c => {
        const v = r[c.key]
        return v == null ? "" : `"${String(v).replace(/"/g, '""')}"`
      }).join(",")
    )
    const csv  = [header, ...rows].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectFilters = extraFilters.filter(f => f.type === "select")
  const rangeFilters  = extraFilters.filter(f => f.type === "range")

  const { pageIndex, pageSize } = table.getState().pagination
  const pageStart = pageIndex * pageSize + 1
  const pageEnd   = Math.min((pageIndex + 1) * pageSize, filtered.length)

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-col gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Tìm trong ${data.length.toLocaleString()} bản ghi...`}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <select
            value={tenantFilter}
            onChange={e => setTenant(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">Tất cả Tenant</option>
            <option value="VN">VN</option>
            <option value="US">US</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">Tất cả Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {selectFilters.map(f => (
            <select
              key={f.field}
              value={xSelect[f.field] ?? "all"}
              onChange={e => setXSelect(prev => ({ ...prev, [f.field]: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">Tất cả {f.label}</option>
              {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          {filtered.length < data.length && (
            <span className="text-xs text-gray-500 ml-1">
              {filtered.length.toLocaleString()} / {data.length.toLocaleString()}
            </span>
          )}
        </div>

        {rangeFilters.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap pt-1 border-t border-gray-200">
            {rangeFilters.map(f => (
              <div key={f.field} className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap">{f.label}:</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={xRange[f.field]?.[0] ?? ""}
                  onChange={e => setXRange(prev => ({ ...prev, [f.field]: [e.target.value, prev[f.field]?.[1] ?? ""] }))}
                  className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-xs text-gray-400">–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={xRange[f.field]?.[1] ?? ""}
                  onChange={e => setXRange(prev => ({ ...prev, [f.field]: [prev[f.field]?.[0] ?? "", e.target.value] }))}
                  className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {table.getHeaderGroups()[0].headers.map(h => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc"  ? <ChevronUp   size={12} /> :
                       h.column.getIsSorted() === "desc" ? <ChevronDown  size={12} /> :
                                                           <ChevronsUpDown size={11} className="text-gray-300" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Không có dữ liệu phù hợp
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"} hover:bg-blue-50/40 transition-colors`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-3 py-2.5 text-gray-700 max-w-[240px]">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {filtered.length > 0 ? `${pageStart}–${pageEnd}` : "0"} / {filtered.length.toLocaleString()}
            </span>
            <select
              value={pageSize}
              onChange={e => table.setPageSize(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
            >
              {[25, 50, 100, 200].map(s => (
                <option key={s} value={s}>{s} / trang</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs text-gray-600 px-2 tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Export */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Export:</span>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <Download size={13} /> CSV
        </button>
        <button
          onClick={exportJSON}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <Download size={13} /> JSON
        </button>
      </div>
    </div>
  )
}
