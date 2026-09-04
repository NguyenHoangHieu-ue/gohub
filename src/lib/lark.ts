import crypto from "crypto";

const LARK_OPEN_BASE = "https://open.larksuite.com/open-apis";

interface LarkTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface LarkUserInfo {
  open_id: string;
  union_id: string;
  name: string;
  en_name?: string;
  avatar_url?: string;
}

/**
 * Đổi authorization code lấy access token. Response KHÔNG chứa open_id
 * (bug v1 s175: code cũ đọc tok.open_id luôn undefined) — bắt buộc gọi
 * riêng getLarkUserInfo() sau đó.
 */
export async function exchangeLarkCode(code: string): Promise<LarkTokenResponse> {
  const res = await fetch(`${LARK_OPEN_BASE}/authen/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.LARK_APP_ID,
      client_secret: process.env.LARK_APP_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`[Lark] token exchange failed: ${res.status}`);
  }

  return res.json();
}

/** Gọi endpoint riêng để lấy open_id thật — né bug v1 s175 */
export async function getLarkUserInfo(accessToken: string): Promise<LarkUserInfo> {
  const res = await fetch(`${LARK_OPEN_BASE}/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[Lark] user_info fetch failed: ${res.status}`);
  }

  const body = await res.json();
  return body.data as LarkUserInfo;
}

/**
 * Verify chữ ký webhook Lark. KHI app bật Encrypt Key, spec Lark bắt buộc:
 *   expected = sha256(timestamp + nonce + LARK_ENCRYPT_KEY + rawBody)
 * SHA256 THƯỜNG, không phải HMAC, và ký bằng ENCRYPT_KEY chứ không phải
 * VERIFICATION_TOKEN — bug v1 s159→s176 dùng sai cả thuật toán lẫn khoá,
 * chặn Bé Gấu câm lặng 1 tuần. Không được lặp lại.
 */
export function verifyLarkSignature(
  timestamp: string,
  nonce: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  const encryptKey = process.env.LARK_ENCRYPT_KEY;
  if (!encryptKey) {
    throw new Error("[Lark] LARK_ENCRYPT_KEY missing — cannot verify signature");
  }

  const expected = crypto
    .createHash("sha256")
    .update(timestamp + nonce + encryptKey + rawBody)
    .digest("hex");

  return expected === signatureHeader;
}
