"""
Chạy script này để tạo AUTH_CONFIG dán vào Streamlit secrets.
Chạy: python generate_auth.py
"""
import getpass
import json
import bcrypt

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(12)).decode()

print("=== Tạo danh sách user cho Gohub PM ===")
print("Nhấn Enter (username trống) để kết thúc\n")

users = {}
while True:
    username = input("Username: ").strip()
    if not username:
        break
    name     = input("  Tên hiển thị: ").strip()
    email    = input("  Email: ").strip()
    role     = input("  Role (admin/sale) [sale]: ").strip() or "sale"
    password = getpass.getpass("  Password: ")
    users[username] = {
        "name":     name,
        "email":    email,
        "password": hash_pw(password),
        "role":     role,
    }
    print(f"  ✓ Đã thêm {username} ({role})\n")

if not users:
    print("Không có user nào được thêm.")
else:
    config = {"usernames": users}
    print("\n=== Dán chuỗi JSON sau vào Streamlit Cloud Secrets ===")
    print("Key: AUTH_CONFIG")
    print("Value:")
    print(json.dumps(config))
