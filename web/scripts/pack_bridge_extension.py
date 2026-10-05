"""Đóng gói extension Bridge cho người dùng tải (nút "Tải extension" trang Bridge).

Chạy MỖI LẦN sửa browser-extension/ (và tăng "version" trong manifest.json):
    python web/scripts/pack_bridge_extension.py
Sinh: web/public/downloads/gau-pro-bridge.zip + web/src/lib/bridge-version.ts (server báo bản mới cho popup).
Test bridge-version.test.ts đỏ nếu quên chạy (manifest ≠ hằng số ≠ zip).
"""
import io, json, os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, "browser-extension")
OUT_ZIP = os.path.join(ROOT, "web", "public", "downloads", "gau-pro-bridge.zip")
OUT_TS = os.path.join(ROOT, "web", "src", "lib", "bridge-version.ts")

version = json.load(io.open(os.path.join(EXT, "manifest.json"), encoding="utf-8"))["version"]
os.makedirs(os.path.dirname(OUT_ZIP), exist_ok=True)
# ZIP_STORED (không nén): file nhỏ, và để test đọc được version trong zip mà không cần giải nén.
with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_STORED) as z:
    for name in sorted(os.listdir(EXT)):
        path = os.path.join(EXT, name)
        if os.path.isfile(path):
            z.write(path, f"gau-pro-bridge/{name}")
io.open(OUT_TS, "w", encoding="utf-8", newline="\n").write(
    "// SINH TỰ ĐỘNG bởi web/scripts/pack_bridge_extension.py — không sửa tay.\n"
    "// Bản extension Bridge mới nhất: server trả cho popup để báo \"có bản mới\"; zip ở /downloads/gau-pro-bridge.zip.\n"
    f'export const BRIDGE_LATEST_VERSION = "{version}"\n'
)
print(f"OK {version} -> {OUT_ZIP}")
