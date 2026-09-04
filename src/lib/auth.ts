import type { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { DBClientFactory } from "@/core/db";
import { exchangeLarkCode, getLarkUserInfo } from "@/lib/lark";
import type { Role } from "@/core/rbac";

interface LarkProfile {
  open_id: string;
  union_id: string;
  name: string;
  en_name?: string;
  avatar_url?: string;
}

/**
 * Provider Lark viết tay (không có provider built-in trong next-auth).
 * Token exchange và userinfo đi qua src/lib/lark.ts để dùng đúng endpoint
 * user_info riêng lấy open_id (né bug v1 s175).
 */
const LarkProvider: OAuthConfig<LarkProfile> = {
  id: "lark",
  name: "Lark",
  type: "oauth",
  clientId: process.env.LARK_APP_ID,
  clientSecret: process.env.LARK_APP_SECRET,
  authorization: {
    url: "https://open.larksuite.com/open-apis/authen/v1/index",
    params: { app_id: process.env.LARK_APP_ID },
  },
  token: {
    async request({ params }) {
      const tok = await exchangeLarkCode(params.code as string);
      return {
        tokens: {
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + tok.expires_in,
        },
      };
    },
  },
  userinfo: {
    async request({ tokens }) {
      return getLarkUserInfo(tokens.access_token as string) as unknown as Record<string, unknown>;
    },
  },
  profile(profile) {
    return {
      id: profile.open_id,
      name: profile.name,
      image: profile.avatar_url ?? null,
    };
  },
};

/**
 * Ánh xạ open_id Lark -> {username, role} nội bộ qua bảng Supabase `users`
 * (đã đọc schema thật, không phải đoán — xem PROGRESS.md). Cột thật:
 * username (PK, dạng "lark_ou_..."), role (7 giá trị legacy v1: bod/staff/
 * admin/b2c/saleb2c/creator/hr — CHƯA khớp 4-role model admin/creator/
 * manager/staff mà blueprint v2 mô tả, cần Hiếu chốt cách map trước khi
 * dùng role thật cho RBAC). lark_open_id, email (đa số NULL — không dùng
 * làm định danh, đúng lesson v1 s163).
 * Không tự tạo user mới ở đây — chỉ admin mới được provision tài khoản.
 */
async function resolveInternalIdentity(larkOpenId: string): Promise<{ username: string; role: Role } | null> {
  const supabase = DBClientFactory.getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("username, role")
    .eq("lark_open_id", larkOpenId)
    .maybeSingle();

  if (error || !data) return null;
  return { username: data.username as string, role: data.role as Role };
}

export const authOptions: NextAuthOptions = {
  providers: [LarkProvider],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      const identity = await resolveInternalIdentity(user.id);
      return identity !== null;
    },
    async jwt({ token, user }) {
      if (user) {
        const identity = await resolveInternalIdentity(user.id);
        if (identity) {
          token.username = identity.username;
          token.role = identity.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.username = token.username;
      session.user.role = token.role;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
