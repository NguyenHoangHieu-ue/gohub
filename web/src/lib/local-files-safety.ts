// Cổng an toàn phía SERVER cho công cụ `localFiles` (đọc/ghi file trên máy người dùng qua daemon local-agent). Daemon đã giới hạn trong thư mục cho phép + chặn tên file bí mật,
// nhưng phiên bản daemon trên máy người dùng có thể cũ/khác → server kiểm thêm TRƯỚC khi đưa lệnh vào hàng đợi (phòng thủ nhiều lớp, chống prompt injection):
//  - ĐỌC/LIỆT KÊ: chặn nơi chứa bí mật (khoá SSH/cloud, hồ sơ trình duyệt, ví, file .env/credentials/secret…);
//  - GHI/SỬA: chặn nơi gây "bám trụ" hoặc chạy mã ngầm (thư mục khởi động, file chạy được/script hệ thống, hook git, workflow CI, rc của shell, thư mục hệ thống).
// Thuần (có test). Trả null = cho qua, chuỗi = lý do từ chối (hiện cho người dùng).
export type LocalAction = "list" | "read" | "write" | "edit"

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase()

const SECRET_NAME = [/^\.env(\.|$)/, /\.(pem|key|pfx|p12|kdbx|ppk|jks|keystore)$/, /^id_(rsa|ed25519|ecdsa|dsa)/, /credentials/, /secret/, /^\.npmrc$/, /^\.netrc$/, /(^|[-_.])(wallet|seed)[-_.]?(phrase)?\./, /^(cookies|login data|web data|local state)(\.|$)/]
const SECRET_SEGMENT = [".ssh", ".aws", ".gnupg", ".kube", ".azure", ".config/gcloud", ".docker", "appdata/roaming/mozilla", "appdata/local/google/chrome/user data", "appdata/local/microsoft/edge/user data", "appdata/roaming/microsoft/credentials", "appdata/roaming/microsoft/protect"]

const EXEC_EXT = /\.(exe|dll|bat|cmd|ps1|psm1|vbs|vbe|wsf|hta|lnk|scr|msi|com|reg|pif|jar|appx)$/
const PERSIST_SEGMENT = ["start menu/programs/startup", "appdata/roaming/microsoft/windows/start menu", "windows/system32", "windows/syswow64", "program files", "programdata/microsoft/windows/start menu", "/etc/cron", "/etc/systemd", "library/launchagents", "library/launchdaemons", ".git/hooks", ".github/workflows", ".husky"]
const PERSIST_NAME = [/^\.(bashrc|bash_profile|zshrc|zprofile|profile)$/, /^(ntuser\.dat|autoexec\.bat)$/, /^microsoft\.powershell_profile\.ps1$/, /^profile\.ps1$/]

export function localFilesVerdict(action: LocalAction, rawPath: string | undefined | null): string | null {
  if (!rawPath) return null   // list không path = thư mục gốc đã cấu hình ở daemon
  const p = norm(String(rawPath))
  const name = p.split("/").filter(Boolean).pop() ?? ""
  if (p.includes("../") || p.endsWith("/..")) return "Đường dẫn có '..' — không cho phép thoát khỏi thư mục được cấp."
  if (SECRET_NAME.some(re => re.test(name)) || SECRET_SEGMENT.some(s => `/${p}/`.includes(`/${s}/`) || p.includes(s))) {
    return "Đường dẫn thuộc nhóm chứa bí mật (khoá SSH/cloud, hồ sơ trình duyệt, file .env/credentials/secret…) — Gấu Pro không đọc/ghi. Người dùng tự mở file nếu cần."
  }
  if (action === "write" || action === "edit") {
    if (EXEC_EXT.test(name)) return "Không ghi/sửa file chạy được hoặc script hệ thống (.exe, .bat, .cmd, .ps1, .vbs, .lnk…) — chống mã chạy ngầm. Người dùng tự tạo file này."
    if (PERSIST_SEGMENT.some(s => p.includes(s)) || PERSIST_NAME.some(re => re.test(name))) {
      return "Không ghi/sửa nơi tự chạy khi khởi động hoặc cấu hình hệ thống/CI (thư mục Startup, Program Files, .git/hooks, .github/workflows, rc của shell…). Người dùng tự làm bước này."
    }
  }
  return null
}
