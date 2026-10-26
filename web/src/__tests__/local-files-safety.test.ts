import { describe, expect, it } from "vitest"
import { localFilesVerdict } from "@/lib/local-files-safety"

const BS = "\\"
const win = (p: string) => p.split("/").join(BS)   // viết đường dẫn bằng "/" cho dễ đọc rồi đổi sang kiểu Windows

describe("localFilesVerdict — đọc/liệt kê", () => {
  it("chặn nơi chứa bí mật (Windows và Unix, không phân biệt hoa thường)", () => {
    for (const p of [win("C:/Users/a/.ssh/id_rsa"), win("C:/Users/a/.aws/credentials"), win("D:/gohub/web/.env.local"), "/home/a/.gnupg/pubring.kbx",
      win("C:/Users/a/AppData/Local/Google/Chrome/User Data/Default/Cookies"), win("D:/x/server.pem"), win("D:/x/my-secret-notes.txt"), win("C:/Users/a/.kube/config")])
      expect(localFilesVerdict("read", p), p).toMatch(/bí mật/)
  })
  it("cho đọc file thường trong dự án", () => {
    for (const p of [win("D:/gohub/README.md"), win("D:/gohub/web/src/lib/notify.ts"), win("D:/BaoCaoThucTap/Output/bao-cao.docx")]) expect(localFilesVerdict("read", p), p).toBeNull()
    expect(localFilesVerdict("list", undefined)).toBeNull()
    expect(localFilesVerdict("list", win("D:/gohub/docs"))).toBeNull()
  })
  it("chặn '..' thoát thư mục", () => { expect(localFilesVerdict("read", win("D:/gohub/../Windows/win.ini"))).toMatch(/\.\./) })
})

describe("localFilesVerdict — ghi/sửa", () => {
  it("chặn file chạy được/script hệ thống", () => {
    for (const p of [win("D:/gohub/run.bat"), win("D:/x/a.ps1"), win("D:/x/tool.EXE"), win("D:/x/Evil.lnk"), win("D:/x/a.vbs")]) expect(localFilesVerdict("write", p), p).toMatch(/chạy được|script/)
  })
  it("chặn nơi bám trụ/CI/thư mục hệ thống", () => {
    for (const p of [win("C:/Users/a/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/x.txt"), win("D:/gohub/.github/workflows/ci.yml"), win("D:/gohub/.git/hooks/pre-commit"), win("C:/Program Files/App/config.ini"), "/home/a/.bashrc"])
      expect(localFilesVerdict("edit", p), p).toMatch(/tự chạy|cấu hình/)
  })
  it("cho ghi/sửa file code và tài liệu thường (kể cả .js/.ts/.md/.json)", () => {
    for (const p of [win("D:/gohub/web/src/a.ts"), win("D:/gohub/docs/plans/x.md"), win("D:/gohub/scripts/build.mjs"), win("D:/gohub/web/package.json")]) expect(localFilesVerdict("write", p), p).toBeNull()
  })
  it("đọc file .cmd/.ps1 vẫn được (chỉ ghi/sửa bị chặn)", () => { expect(localFilesVerdict("read", win("D:/gohub/local-agent/start-agent.cmd"))).toBeNull() })
})
