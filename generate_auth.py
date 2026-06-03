"""
Quản lý user cho Gohub PM.
Chạy: python generate_auth.py

Lưu thông tin vào auth_config.json (gitignored).
Khi cần deploy: chọn "Xuất JSON" rồi paste vào Streamlit Cloud Secrets với key AUTH_CONFIG.
"""
import json
import getpass
import os
import bcrypt

CONFIG_FILE = "auth_config.json"


def load() -> dict:
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"usernames": {}}


def save(config: dict):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(12)).decode()


def check_pw(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def list_users(users: dict):
    if not users:
        print("  (chưa có user nào)")
        return
    print(f"  {'Username':<15} {'Tên':<20} {'Role':<8} {'Email'}")
    print(f"  {'-'*15} {'-'*20} {'-'*8} {'-'*25}")
    for uname, info in users.items():
        print(f"  {uname:<15} {info['name']:<20} {info['role']:<8} {info['email']}")


def add_user(config: dict):
    users = config["usernames"]
    print("\n--- Thêm user mới ---")
    username = input("Username: ").strip()
    if not username:
        print("Hủy.")
        return
    if username in users:
        print(f"⚠️  Username '{username}' đã tồn tại. Dùng 'Sửa user' để cập nhật.")
        return
    name  = input("Tên hiển thị: ").strip()
    email = input("Email: ").strip()
    role  = input("Role (admin/sale) [sale]: ").strip() or "sale"
    pw    = getpass.getpass("Password: ")
    pw2   = getpass.getpass("Nhập lại password: ")
    if pw != pw2:
        print("❌ Password không khớp. Hủy.")
        return
    users[username] = {"name": name, "email": email, "role": role, "password": hash_pw(pw)}
    save(config)
    print(f"✅ Đã thêm user '{username}' ({role})")


def change_password(config: dict):
    users = config["usernames"]
    print("\n--- Đổi password ---")
    username = input("Username: ").strip()
    if username not in users:
        print(f"❌ Không tìm thấy '{username}'")
        return
    pw  = getpass.getpass("Password mới: ")
    pw2 = getpass.getpass("Nhập lại: ")
    if pw != pw2:
        print("❌ Password không khớp. Hủy.")
        return
    users[username]["password"] = hash_pw(pw)
    save(config)
    print(f"✅ Đã đổi password cho '{username}'")


def change_role(config: dict):
    users = config["usernames"]
    print("\n--- Đổi role ---")
    username = input("Username: ").strip()
    if username not in users:
        print(f"❌ Không tìm thấy '{username}'")
        return
    current = users[username]["role"]
    new_role = input(f"Role mới (admin/sale) [hiện tại: {current}]: ").strip()
    if new_role not in ("admin", "sale"):
        print("❌ Role không hợp lệ. Hủy.")
        return
    users[username]["role"] = new_role
    save(config)
    print(f"✅ Đã đổi role '{username}': {current} → {new_role}")


def delete_user(config: dict):
    users = config["usernames"]
    print("\n--- Xóa user ---")
    username = input("Username: ").strip()
    if username not in users:
        print(f"❌ Không tìm thấy '{username}'")
        return
    confirm = input(f"Xác nhận xóa '{username}'? (yes/no): ").strip()
    if confirm != "yes":
        print("Hủy.")
        return
    del users[username]
    save(config)
    print(f"✅ Đã xóa user '{username}'")


def export_json(config: dict):
    print("\n--- Xuất JSON cho Streamlit Secrets ---")
    print("Paste đoạn sau vào Streamlit Cloud → Secrets, key = AUTH_CONFIG:\n")
    print(json.dumps(config))
    print()


def main():
    config = load()

    while True:
        print("\n========== Gohub PM — Quản lý User ==========")
        list_users(config["usernames"])
        print()
        print("  [1] Thêm user")
        print("  [2] Đổi password")
        print("  [3] Đổi role")
        print("  [4] Xóa user")
        print("  [5] Xuất JSON → Streamlit Secrets")
        print("  [0] Thoát")
        choice = input("\nChọn: ").strip()

        if choice == "1":
            add_user(config)
        elif choice == "2":
            change_password(config)
        elif choice == "3":
            change_role(config)
        elif choice == "4":
            delete_user(config)
        elif choice == "5":
            export_json(config)
        elif choice == "0":
            print("Thoát.")
            break
        else:
            print("Lựa chọn không hợp lệ.")


if __name__ == "__main__":
    main()
