import { beforeEach, describe, expect, it, vi } from "vitest"

const settings = new Map<string, string>()
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: (_c: string, k: string) => ({ maybeSingle: async () => ({ data: settings.has(k) ? { value: settings.get(k) } : null }) }) }),
      upsert: async (row: { key: string; value: string }) => { settings.set(row.key, row.value); return { error: null } },
    }),
  },
}))

import { MAX_RUN_CODE_CALLS, execRunCode, isTextOutput, mapOutputPath, type CodeDeps } from "@/lib/argon/code-tool"
import { NoSnapshotError, addUsage, getUsage, quotaState, runPython, type SbxBackend, type SbxHandle } from "@/lib/argon/sandbox"

beforeEach(() => settings.clear())

describe("mapOutputPath / isTextOutput", () => {
  it("out/x → reports/x; thư mục chuẩn giữ nguyên; đường dẫn xấu bị loại", () => {
    expect(mapOutputPath("out/so_sanh.xlsx")).toBe("reports/so_sanh.xlsx")
    expect(mapOutputPath("out/data/kq.csv")).toBe("data/kq.csv")
    expect(mapOutputPath("out/notes/a.md")).toBe("notes/a.md")
    expect(mapOutputPath("out/linh_tinh/a.csv")).toBe("reports/linh_tinh/a.csv")
    expect(mapOutputPath("out/../etc/passwd")).toBeNull()
    expect(mapOutputPath("out/.an.txt")).toBeNull()
  })
  it("file chữ nhỏ lưu text, xlsx/png/file lớn lưu nhị phân", () => {
    expect(isTextOutput("data/a.csv", 100)).toBe(true)
    expect(isTextOutput("reports/a.html", 100)).toBe(true)
    expect(isTextOutput("reports/a.xlsx", 100)).toBe(false)
    expect(isTextOutput("data/a.csv", 2 * 1024 * 1024)).toBe(false)
  })
})

describe("quota", () => {
  it("chặn khi dùng hết trần; cộng dồn theo tháng", async () => {
    expect(quotaState(0, 1000).ok).toBe(true)
    expect(quotaState(1000, 1000).ok).toBe(false)
    expect(quotaState(1000, 1000).message).toContain("giờ CPU")
    await addUsage(1500); await addUsage(500.4)
    expect(await getUsage()).toEqual({ cpuMs: 2000, runs: 2 })
  })
})

function fakeBackend(opts: { exit?: number; stdout?: string; stderr?: string; outs?: Record<string, string>; createFails?: boolean; cpu?: number | undefined } = {}) {
  const log: string[] = []
  const written: string[] = []
  const handle: SbxHandle = {
    writeFiles: async fs => { fs.forEach(f => written.push(f.path)) },
    run: async script => {
      log.push(script)
      if (script.startsWith("cd /tmp/argon && find out")) return { exitCode: 0, stdout: Object.keys(opts.outs ?? {}).map(p => `out/${p}`).join("\n"), stderr: "" }
      if (script.includes("main.py")) return { exitCode: opts.exit ?? 0, stdout: opts.stdout ?? "", stderr: opts.stderr ?? "" }
      return { exitCode: 0, stdout: "", stderr: "" }
    },
    readFile: async p => { const k = p.replace("/tmp/argon/out/", ""); return opts.outs && k in opts.outs ? Buffer.from(opts.outs[k]) : null },
    snapshot: async () => "snap_new",
    stop: async () => { log.push("stop"); return "cpu" in opts ? opts.cpu : 1234 },
  }
  const backend: SbxBackend = { create: async o => { log.push(`create net=${o.network} snap=${o.snapshotId ?? "-"}`); if (opts.createFails) throw new Error("snapshot expired"); return handle } }
  return { backend, log, written }
}

describe("runPython", () => {
  it("chưa có snapshot → NoSnapshotError, không tạo sandbox", async () => {
    const f = fakeBackend()
    await expect(runPython(f.backend, "print(1)", [])).rejects.toBeInstanceOf(NoSnapshotError)
    expect(f.log).toEqual([])
  })
  it("có snapshot: mạng ĐÓNG, ghi main.py + input, gom out/, luôn stop, CPU thật", async () => {
    settings.set("argon_sandbox_snapshot", JSON.stringify({ id: "snap_1", at: "x", packages: [] }))
    const f = fakeBackend({ stdout: "ok", outs: { "a.csv": "x,y\n1,2\n", "data/b.csv": "z" }, cpu: 3210 })
    const r = await runPython(f.backend, "print('ok')", [{ path: "data/rev.csv", content: "a,b" }])
    expect(f.log[0]).toBe("create net=false snap=snap_1")
    expect(f.written).toEqual(["/tmp/argon/data/rev.csv", "/tmp/argon/main.py"])
    expect(r.outputs.map(o => o.path)).toEqual(["out/a.csv", "out/data/b.csv"])
    expect(r.cpuMs).toBe(3210)
    expect(f.log[f.log.length - 1]).toBe("stop")
  })
  it("SDK không trả CPU → tính theo thời gian chạy; lỗi giữa chừng vẫn stop", async () => {
    settings.set("argon_sandbox_snapshot", JSON.stringify({ id: "snap_1" }))
    const f = fakeBackend({ cpu: undefined })
    const r = await runPython(f.backend, "x", [])
    expect(r.cpuMs).toBe(r.durationMs)
    const g = fakeBackend()
    g.backend.create = async () => ({ ...(await fakeBackend().backend.create({ network: false, timeoutMs: 1 })), writeFiles: async () => { throw new Error("disk full") }, stop: async () => { g.log.push("stop"); return 1 } })
    await expect(runPython(g.backend, "x", [])).rejects.toThrow("disk full")
    expect(g.log).toContain("stop")
  })
  it("snapshot hết hạn (create lỗi) → NoSnapshotError có hướng dẫn dựng lại", async () => {
    settings.set("argon_sandbox_snapshot", JSON.stringify({ id: "snap_old" }))
    await expect(runPython(fakeBackend({ createFails: true }).backend, "x", [])).rejects.toThrow(/Chuẩn bị Sandbox/)
  })
})

function deps(over: Partial<CodeDeps> = {}): CodeDeps & { saved: string[] } {
  const saved: string[] = []
  return {
    saved,
    readInput: async p => (p === "data/rev.csv" ? { path: p, content: "a,b\n1,2" } : null),
    saveText: async p => { saved.push(`T:${p}`); return {} },
    saveBinary: async p => { saved.push(`B:${p}`); return {} },
    usage: async () => ({ cpuMs: 0 }), addUsage: async () => {}, quota: u => quotaState(u, 10_000),
    run: async () => ({ exitCode: 0, stdout: "tổng = 3", stderr: "", outputs: [{ path: "out/kq.xlsx", content: Buffer.from("PK") }, { path: "out/data/kq.csv", content: Buffer.from("a\n1") }], cpuMs: 2500, durationMs: 3000, skipped: [] }),
    ...over,
  }
}
const ctx = { phase: "run" as const, callsSoFar: 0 }

describe("execRunCode", () => {
  it("chỉ ở pha chạy; không đụng sandbox ở pha khác", async () => {
    const run = vi.fn()
    for (const phase of ["clarify", "plan", "paused", "done"] as const) {
      const r = await execRunCode({ code: "print(1)" }, { phase, callsSoFar: 0 }, deps({ run }))
      expect(r.ok).toBe(false); expect(r.result).toContain("pha chạy")
    }
    expect(run).not.toHaveBeenCalled()
  })
  it("chạy thành công: lưu xlsx nhị phân + csv text đúng chỗ, báo CPU và stdout", async () => {
    const d = deps()
    const r = await execRunCode({ code: "print(3)", inputs: ["data/rev.csv"] }, ctx, d)
    expect(r.ok).toBe(true)
    expect(d.saved).toEqual(["B:reports/kq.xlsx", "T:data/kq.csv"])
    expect(r.result).toContain("2.5s CPU")
    expect(r.result).toContain("reports/kq.xlsx (1KB)")
    expect(r.result).toContain("tổng = 3")
  })
  it("exit khác 0: ok=false kèm stderr (cắt đầu khi dài); vẫn tính quota", async () => {
    const add = vi.fn(async () => {})
    const r = await execRunCode({ code: "1/0" }, ctx, deps({ addUsage: add, run: async () => ({ exitCode: 1, stdout: "", stderr: "x".repeat(9000) + "ZeroDivisionError", outputs: [], cpuMs: 800, durationMs: 900, skipped: [] }) }))
    expect(r.ok).toBe(false)
    expect(r.result).toContain("LỖI (exit 1)")
    expect(r.result).toContain("ZeroDivisionError")
    expect(r.result.length).toBeLessThan(7000)
    expect(add).toHaveBeenCalledWith(800)
  })
  it("chặn: hết quota, quá số lần, thiếu code, file đầu vào không có", async () => {
    const run = vi.fn()
    expect((await execRunCode({ code: "x" }, ctx, deps({ run, usage: async () => ({ cpuMs: 99_999 }) }))).result).toContain("giờ CPU")
    expect((await execRunCode({ code: "x" }, { ...ctx, callsSoFar: MAX_RUN_CODE_CALLS }, deps({ run }))).result).toContain("lần trong lượt")
    expect((await execRunCode({ code: "  " }, ctx, deps({ run }))).result).toContain("Thiếu code")
    expect((await execRunCode({ code: "x", inputs: ["data/khong_co.csv"] }, ctx, deps({ run }))).result).toContain("Không đọc được file đầu vào")
    expect(run).not.toHaveBeenCalled()
  })
  it("NoSnapshotError chuyển thành hướng dẫn chuẩn bị Sandbox; nhật ký rút gọn code dài", async () => {
    const r = await execRunCode({ code: "y".repeat(5000) }, ctx, deps({ run: async () => { throw new NoSnapshotError() } }))
    expect(r.ok).toBe(false)
    expect(r.result).toContain("Chuẩn bị Sandbox")
    expect(String(r.args.code).length).toBeLessThan(1700)
  })
})
